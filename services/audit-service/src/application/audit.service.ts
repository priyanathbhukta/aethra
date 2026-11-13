// ==============================================================================
// AETHRA Audit Service — Application Domain Service & Sanitization Engine
// ==============================================================================

import crypto from 'node:crypto';
import { Kysely } from 'kysely';
import { AuditDatabaseSchema } from '../database/connection.js';
import { createStructuredLogger } from '@aethra/observability';

const logger = createStructuredLogger('audit-service');

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /otp/i,
  /authorization/i,
  /apikey/i,
  /api_?key/i,
  /privatekey/i,
  /private_?key/i,
  /pin/i,
  /cvv/i,
  /card_?number/i,
  /credit_?card/i,
];

/**
 * Recursively deep-sanitizes payloads by redacting sensitive credential keys
 */
export function sanitizePayload(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizePayload(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizePayload(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export interface RecordAuditEventCommand {
  organisationId?: string;
  actorUserId?: string;
  actorRole?: string;
  clientIp?: string;
  userAgent?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestCorrelationId?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  result?: 'success' | 'failure' | 'denied';
}

export interface QueryAuditEventsParams {
  organisationId?: string;
  actorUserId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  requestCorrelationId?: string;
  result?: 'success' | 'failure' | 'denied';
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export class AuditApplicationService {
  constructor(private readonly db: Kysely<AuditDatabaseSchema>) {}

  /**
   * Appends an immutable audit event to the audit ledger after scrubbing sensitive data.
   */
  async recordAuditEvent(cmd: RecordAuditEventCommand) {
    const auditId = crypto.randomUUID();
    const sanitizedBefore = cmd.beforeState
      ? (sanitizePayload(cmd.beforeState) as Record<string, unknown>)
      : null;
    const sanitizedAfter = cmd.afterState
      ? (sanitizePayload(cmd.afterState) as Record<string, unknown>)
      : null;

    const recordedAt = new Date();

    const result = await this.db
      .insertInto('audit_events')
      .values({
        id: auditId,
        organisation_id: cmd.organisationId || null,
        actor_user_id: cmd.actorUserId || null,
        actor_role: cmd.actorRole || null,
        client_ip: cmd.clientIp || null,
        user_agent: cmd.userAgent || null,
        action: cmd.action,
        resource_type: cmd.resourceType,
        resource_id: cmd.resourceId || null,
        request_correlation_id: cmd.requestCorrelationId || null,
        before_state: sanitizedBefore,
        after_state: sanitizedAfter,
        result: cmd.result || 'success',
        recorded_at: recordedAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.info(
      {
        auditId,
        action: cmd.action,
        resourceType: cmd.resourceType,
        resourceId: cmd.resourceId,
        correlationId: cmd.requestCorrelationId,
      },
      'Audit log entry recorded'
    );

    return result;
  }

  /**
   * Queries audit events with multi-attribute filtering and pagination.
   */
  async queryAuditEvents(params: QueryAuditEventsParams) {
    const limit = Math.min(params.limit || 50, 200);
    const offset = params.offset || 0;

    let query = this.db.selectFrom('audit_events').selectAll();

    if (params.organisationId) {
      query = query.where('organisation_id', '=', params.organisationId);
    }
    if (params.actorUserId) {
      query = query.where('actor_user_id', '=', params.actorUserId);
    }
    if (params.action) {
      query = query.where('action', '=', params.action);
    }
    if (params.resourceType) {
      query = query.where('resource_type', '=', params.resourceType);
    }
    if (params.resourceId) {
      query = query.where('resource_id', '=', params.resourceId);
    }
    if (params.requestCorrelationId) {
      query = query.where('request_correlation_id', '=', params.requestCorrelationId);
    }
    if (params.result) {
      query = query.where('result', '=', params.result);
    }
    if (params.fromDate) {
      query = query.where('recorded_at', '>=', params.fromDate);
    }
    if (params.toDate) {
      query = query.where('recorded_at', '<=', params.toDate);
    }

    const items = await query
      .orderBy('recorded_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return {
      items,
      limit,
      offset,
    };
  }
}
