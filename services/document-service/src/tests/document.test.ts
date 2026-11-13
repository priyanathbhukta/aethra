// ==============================================================================
// AETHRA Document Service — Security & URL Authorization Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { DocumentApplicationService } from '../application/document.service.js';

test('Document Service — Private Storage & Access Control Scenarios', async (t) => {
  await t.test('Scenario 1: Generates presigned upload session with HMAC token and expiry', async () => {
    let insertedSession: any = null;

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            executeTakeFirst: async () => ({
              id: 'c1',
              code: 'quotation_proposal',
              name: 'Quotation Proposal PDF',
            }),
          }),
        }),
      }),
      insertInto: () => ({
        values: (vals: any) => {
          insertedSession = vals;
          return {
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => vals,
            }),
          };
        },
      }),
    };

    const service = new DocumentApplicationService(mockDb);
    const result = await service.createUploadSession({
      organisationId: 'vendor-sunvolt-01',
      classificationCode: 'quotation_proposal',
      fileName: 'Proposal_Sharma_5kW.pdf',
      contentType: 'application/pdf',
      maxBytes: 10485760, // 10MB
    });

    assert.ok(result);
    assert.ok(result.presignedUploadUrl.includes('https://s3.ap-south-1.amazonaws.com/'));
    assert.ok(result.presignedUploadUrl.includes('sig='));
    assert.strictEqual(result.maxBytes, 10485760);
    assert.ok(insertedSession);
  });

  await t.test('Scenario 2: Confirm upload registers file and emits document.upload.completed.v1 event', async () => {
    const validSession = {
      id: 'sess-001',
      organisation_id: 'vendor-sunvolt-01',
      session_token: 'tok-abc-123',
      target_s3_key: 'uploads/vendor-sunvolt-01/2026/sess-001/Proposal_5kW.pdf',
      expected_content_type: 'application/pdf',
      expires_at: new Date(Date.now() + 600000), // future
      status: 'pending',
    };

    let registeredFile: any = null;
    const outboxEvents: any[] = [];

    const mockDb: any = {
      selectFrom: (table: string) => ({
        selectAll: () => ({
          where: () => ({
            executeTakeFirst: async () => (table === 'upload_sessions' ? validSession : null),
          }),
          executeTakeFirstOrThrow: async () => ({ id: 'c1', code: 'quotation_proposal' }),
        }),
      }),
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            updateTable: () => ({
              set: () => ({
                where: () => ({
                  execute: async () => {},
                }),
              }),
            }),
            insertInto: (table: string) => ({
              values: (vals: any) => {
                if (table === 'files') registeredFile = vals;
                if (table === 'outbox_events') outboxEvents.push(vals);
                return {
                  returningAll: () => ({
                    executeTakeFirstOrThrow: async () => vals,
                  }),
                  execute: async () => {},
                };
              },
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new DocumentApplicationService(mockDb);
    const file = await service.confirmUpload({
      sessionToken: 'tok-abc-123',
      fileSizeBytes: 2048500,
      sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      uploadedByUserId: 'usr-sales-01',
      entityType: 'quotation',
      entityId: 'quot-001',
      permissionRequired: 'quotation.read',
      allowCustomerAccess: true,
      correlationId: 'corr-doc-101',
    });

    assert.ok(file);
    assert.strictEqual(registeredFile.file_size_bytes, 2048500);
    assert.strictEqual(outboxEvents.length, 1);
    assert.strictEqual(outboxEvents[0].event_type, 'document.upload.completed.v1');
    assert.strictEqual(outboxEvents[0].payload.data.fileSizeBytes, 2048500);
  });

  await t.test('Scenario 3: Scenario 12: Rejects file download when user lacks required permission', async () => {
    const fileRecord = {
      id: 'file-001',
      organisation_id: 'vendor-sunvolt-01',
      file_name: 'Confidential_Margin_Report.pdf',
      s3_bucket: 'aethra-files-prod',
      s3_key: 'uploads/vendor-sunvolt-01/2026/margins.pdf',
      content_type: 'application/pdf',
      file_size_bytes: 512000,
    };

    const policyRecord = {
      file_id: 'file-001',
      permission_required: 'financials.read', // User requires this
      allow_customer_access: false,
    };

    const mockDb: any = {
      selectFrom: (table: string) => ({
        selectAll: () => ({
          where: () => ({
            executeTakeFirst: async () => (table === 'files' ? fileRecord : null),
            execute: async () => (table === 'file_access_policies' ? [policyRecord] : []),
          }),
        }),
      }),
    };

    const service = new DocumentApplicationService(mockDb);

    await assert.rejects(
      async () => {
        await service.generateDownloadUrl({
          fileId: 'file-001',
          organisationId: 'vendor-sunvolt-01',
          requestingUserId: 'usr-intern',
          userPermissions: ['project.read'], // Missing financials.read
          isCustomerUser: false,
        });
      },
      /ACCESS_DENIED: Missing required permission/,
      'Must deny download if user lacks required permission'
    );
  });

  await t.test('Scenario 4: Rejects customer download when file policy denies customer access', async () => {
    const fileRecord = {
      id: 'file-002',
      organisation_id: 'vendor-sunvolt-01',
      file_name: 'Internal_Site_Survey_Raw_Notes.docx',
      s3_bucket: 'aethra-files-prod',
      s3_key: 'uploads/vendor-sunvolt-01/2026/notes.docx',
      content_type: 'application/docx',
      file_size_bytes: 120000,
    };

    const policyRecord = {
      file_id: 'file-002',
      permission_required: 'survey.read',
      allow_customer_access: false, // Internal only
    };

    const mockDb: any = {
      selectFrom: (table: string) => ({
        selectAll: () => ({
          where: () => ({
            executeTakeFirst: async () => (table === 'files' ? fileRecord : null),
            execute: async () => (table === 'file_access_policies' ? [policyRecord] : []),
          }),
        }),
      }),
    };

    const service = new DocumentApplicationService(mockDb);

    await assert.rejects(
      async () => {
        await service.generateDownloadUrl({
          fileId: 'file-002',
          organisationId: 'vendor-sunvolt-01',
          requestingUserId: 'cust-sharma-99',
          userPermissions: [],
          isCustomerUser: true,
        });
      },
      /ACCESS_DENIED: File is internal/,
      'Must reject customer download on internal documents'
    );
  });

  await t.test('Scenario 5: Generates time-limited HMAC download URL when authorized', async () => {
    const fileRecord = {
      id: 'file-003',
      organisation_id: 'vendor-sunvolt-01',
      file_name: 'Quotation_Proposal.pdf',
      s3_bucket: 'aethra-files-prod',
      s3_key: 'uploads/vendor-sunvolt-01/2026/proposal.pdf',
      content_type: 'application/pdf',
      file_size_bytes: 350000,
    };

    const policyRecord = {
      file_id: 'file-003',
      permission_required: 'quotation.read',
      allow_customer_access: true,
    };

    const mockDb: any = {
      selectFrom: (table: string) => ({
        selectAll: () => ({
          where: () => ({
            executeTakeFirst: async () => (table === 'files' ? fileRecord : null),
            execute: async () => (table === 'file_access_policies' ? [policyRecord] : []),
          }),
        }),
      }),
    };

    const service = new DocumentApplicationService(mockDb);
    const result = await service.generateDownloadUrl({
      fileId: 'file-003',
      organisationId: 'vendor-sunvolt-01',
      requestingUserId: 'cust-sharma-99',
      userPermissions: [],
      isCustomerUser: true, // Allowed because allow_customer_access is true
    });

    assert.ok(result);
    assert.ok(result.downloadUrl.includes('https://s3.ap-south-1.amazonaws.com/'));
    assert.ok(result.downloadUrl.includes('sig='));
    assert.ok(result.downloadUrl.includes('exp='));
  });
});
