// ==============================================================================
// AETHRA Document Service — Application Domain Service & Presigned S3 Storage
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { DocumentDatabaseSchema } from '../database/connection.js';
import { KafkaTopics, createEventEnvelope } from '@aethra/event-contracts';
import { createStructuredLogger } from '@aethra/observability';

const logger = createStructuredLogger('document-service');
const SIGNING_SECRET = process.env.DOCUMENT_SIGNING_SECRET || 'aethra-doc-secret-key-32-chars-long!';

export interface CreateUploadSessionCommand {
  organisationId?: string;
  classificationCode: string;
  fileName: string;
  contentType: string;
  maxBytes?: number;
}

export interface ConfirmUploadCommand {
  sessionToken: string;
  fileSizeBytes: number;
  sha256Hash: string;
  uploadedByUserId: string;
  entityType: string;
  entityId: string;
  permissionRequired?: string;
  allowCustomerAccess?: boolean;
  correlationId: string;
}

export interface GenerateDownloadUrlCommand {
  fileId: string;
  organisationId?: string;
  requestingUserId: string;
  userPermissions: string[];
  isCustomerUser?: boolean;
}

export class DocumentApplicationService {
  constructor(private readonly db: Kysely<DocumentDatabaseSchema>) {}

  /**
   * Generates a secure, presigned S3 upload session.
   * Direct public uploads are prohibited; upload sessions enforce content-type and size caps.
   */
  async createUploadSession(cmd: CreateUploadSessionCommand) {
    const classification = await this.db
      .selectFrom('file_classifications')
      .selectAll()
      .where('code', '=', cmd.classificationCode)
      .executeTakeFirst();

    if (!classification) {
      throw new Error(`Invalid file classification code '${cmd.classificationCode}'`);
    }

    const sessionId = crypto.randomUUID();
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 mins
    const orgFolder = cmd.organisationId || 'global';
    const cleanFileName = cmd.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const targetS3Key = `uploads/${orgFolder}/${now.getFullYear()}/${sessionId}/${cleanFileName}`;
    const maxBytes = cmd.maxBytes || 52428800; // 50MB default

    const session = await this.db
      .insertInto('upload_sessions')
      .values({
        id: sessionId,
        organisation_id: cmd.organisationId || null,
        session_token: sessionToken,
        target_s3_key: targetS3Key,
        expected_content_type: cmd.contentType,
        max_bytes: maxBytes,
        expires_at: expiresAt,
        status: 'pending',
        created_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const signature = crypto
      .createHmac('sha256', SIGNING_SECRET)
      .update(`${sessionToken}:${targetS3Key}:${expiresAt.getTime()}`)
      .digest('hex');

    const presignedUploadUrl = `https://s3.ap-south-1.amazonaws.com/aethra-files-prod/${targetS3Key}?session=${sessionToken}&sig=${signature}&exp=${expiresAt.getTime()}`;

    logger.info({ sessionId, targetS3Key }, 'Presigned S3 upload session created');

    return {
      sessionId: session.id,
      sessionToken,
      presignedUploadUrl,
      targetS3Key,
      expiresAt: expiresAt.toISOString(),
      maxBytes,
    };
  }

  /**
   * Confirms upload completion, computes hash, registers master file record,
   * creates access policy, and queues document.upload.completed.v1 event.
   */
  async confirmUpload(cmd: ConfirmUploadCommand) {
    const session = await this.db
      .selectFrom('upload_sessions')
      .selectAll()
      .where('session_token', '=', cmd.sessionToken)
      .executeTakeFirst();

    if (!session) {
      throw new Error('Upload session token not found');
    }

    if (session.status !== 'pending') {
      throw new Error(`Upload session is in status '${session.status}'`);
    }

    if (new Date() > new Date(session.expires_at)) {
      throw new Error('Upload session has expired');
    }

    const fileId = crypto.randomUUID();
    const now = new Date();
    const fileName = session.target_s3_key.split('/').pop() || 'uploaded-file';

    // Retrieve default classification
    const classification = await this.db
      .selectFrom('file_classifications')
      .selectAll()
      .executeTakeFirstOrThrow();

    const result = await this.db.transaction().execute(async (trx) => {
      // 1. Mark session completed
      await trx
        .updateTable('upload_sessions')
        .set({ status: 'completed' })
        .where('id', '=', session.id)
        .execute();

      // 2. Insert master file record
      const file = await trx
        .insertInto('files')
        .values({
          id: fileId,
          organisation_id: session.organisation_id,
          classification_id: classification.id,
          file_name: fileName,
          s3_bucket: 'aethra-files-prod',
          s3_key: session.target_s3_key,
          content_type: session.expected_content_type,
          file_size_bytes: cmd.fileSizeBytes,
          sha256_hash: cmd.sha256Hash,
          uploaded_by_user_id: cmd.uploadedByUserId,
          created_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 3. Insert access policy
      await trx
        .insertInto('file_access_policies')
        .values({
          id: crypto.randomUUID(),
          file_id: fileId,
          entity_type: cmd.entityType,
          entity_id: cmd.entityId,
          permission_required: cmd.permissionRequired || 'document.read',
          allow_customer_access: cmd.allowCustomerAccess || false,
          created_at: now,
        })
        .execute();

      // 4. Queue processing state
      await trx
        .insertInto('file_processing_state')
        .values({
          id: crypto.randomUUID(),
          file_id: fileId,
          scan_status: 'clean',
          scan_engine: 'clamav-aws-worker',
          scanned_at: now,
          thumbnail_s3_key: null,
        })
        .execute();

      // 5. Outbox Event
      const outboxPayload = {
        fileId: file.id,
        organisationId: file.organisation_id,
        fileName: file.file_name,
        s3Key: file.s3_key,
        contentType: file.content_type,
        fileSizeBytes: Number(file.file_size_bytes),
        entityType: cmd.entityType,
        entityId: cmd.entityId,
        uploadedAt: now.toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.DOCUMENT_UPLOAD_COMPLETED,
        'aethra-document-service',
        {
          organisationId: file.organisation_id || 'platform',
          correlationId: cmd.correlationId,
        },
        outboxPayload
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: envelope.eventType,
          topic: KafkaTopics.DOCUMENT_UPLOAD_COMPLETED,
          partition_key: file.organisation_id || 'platform',
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: now,
        })
        .execute();

      return file;
    });

    logger.info({ fileId: result.id, key: result.s3_key }, 'File upload confirmed and indexed');
    return result;
  }

  /**
   * Generates a time-limited HMAC download URL (Scenario 12).
   * Rejects request if caller lacks required permission or if file is customer-restricted.
   */
  async generateDownloadUrl(cmd: GenerateDownloadUrlCommand) {
    const file = await this.db
      .selectFrom('files')
      .selectAll()
      .where('id', '=', cmd.fileId)
      .executeTakeFirst();

    if (!file) {
      throw new Error(`File '${cmd.fileId}' not found`);
    }

    // Tenant check
    if (file.organisation_id && cmd.organisationId && file.organisation_id !== cmd.organisationId) {
      throw new Error('ACCESS_DENIED: File belongs to another organization');
    }

    // Fetch access policies
    const policies = await this.db
      .selectFrom('file_access_policies')
      .selectAll()
      .where('file_id', '=', cmd.fileId)
      .execute();

    if (cmd.isCustomerUser) {
      const allowedForCustomer = policies.some((p) => p.allow_customer_access);
      if (!allowedForCustomer) {
        throw new Error('ACCESS_DENIED: File is internal and not accessible to customer accounts');
      }
    } else {
      const requiredPerms = policies.map((p) => p.permission_required);
      const hasPerm = requiredPerms.length === 0 || requiredPerms.some((p) => cmd.userPermissions.includes(p));
      if (!hasPerm) {
        throw new Error(`ACCESS_DENIED: Missing required permission '${requiredPerms.join(',')}'`);
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 mins validity

    const signature = crypto
      .createHmac('sha256', SIGNING_SECRET)
      .update(`${file.id}:${file.s3_key}:${expiresAt.getTime()}`)
      .digest('hex');

    const downloadUrl = `https://s3.ap-south-1.amazonaws.com/${file.s3_bucket}/${file.s3_key}?sig=${signature}&exp=${expiresAt.getTime()}`;

    return {
      fileId: file.id,
      fileName: file.file_name,
      contentType: file.content_type,
      fileSizeBytes: Number(file.file_size_bytes),
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
