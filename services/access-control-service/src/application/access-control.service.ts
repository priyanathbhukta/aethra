// ==============================================================================
// AETHRA Access Control Service — Hybrid RBAC + ABAC Policy Engine
// ==============================================================================

import { Kysely } from 'kysely';
import { AccessControlDatabaseSchema } from '../database/connection.js';
import { KafkaTopics, createEventEnvelope, PolicyInvalidatedEventPayload } from '@aethra/event-contracts';
import { createStructuredLogger } from '@aethra/observability';

const logger = createStructuredLogger('access-control-service');

export interface PolicyEvaluationRequest {
  userId: string;
  organisationId: string;
  membershipId?: string;
  requiredPermission: string;
  resourceAttributes?: {
    branchId?: string;
    warehouseId?: string;
    assignedUserId?: string;
    projectId?: string;
  };
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  reason?: string;
  evaluatedAt: string;
  matchedRole?: string;
  isPrivilegedOverride?: boolean;
}

export interface AssignRoleCommand {
  organisationId: string;
  membershipId: string;
  roleId: string;
  assignedByUserId: string;
  correlationId: string;
}

export interface GrantTemporaryAccessCommand {
  organisationId: string;
  userId: string;
  permissionCode: string;
  reason: string;
  durationMinutes: number;
  grantedByUserId: string;
  correlationId: string;
}

export class AccessControlApplicationService {
  constructor(private readonly db: Kysely<AccessControlDatabaseSchema>) {}

  /**
   * Main Policy Evaluation Engine:
   * 1. Default to Deny
   * 2. Check for active temporary privileged grants
   * 3. Evaluate RBAC role permissions
   * 4. Evaluate ABAC contextual attribute scopes (branch, warehouse, assignment)
   */
  async evaluatePolicy(req: PolicyEvaluationRequest): Promise<PolicyEvaluationResult> {
    const now = new Date().toISOString();

    // 1. Check for Active Temporary Privileged Access Grant
    const tempGrant = await this.db
      .selectFrom('temporary_access_grants')
      .selectAll()
      .where('organisation_id', '=', req.organisationId)
      .where('user_id', '=', req.userId)
      .where('permission_code', '=', req.requiredPermission)
      .where('valid_from', '<=', new Date())
      .where('valid_until', '>=', new Date())
      .where('revoked_at', 'is', null)
      .executeTakeFirst();

    if (tempGrant) {
      logger.info({ userId: req.userId, permission: req.requiredPermission }, 'Access granted via active temporary privilege override');
      return {
        allowed: true,
        reason: `Temporary privileged access: ${tempGrant.reason}`,
        evaluatedAt: now,
        isPrivilegedOverride: true,
      };
    }

    // If membershipId is not provided, locate it
    if (!req.membershipId) {
      // Find role assignments directly or require membershipId
      return {
        allowed: false,
        reason: 'Default Deny: Missing membership context for tenant evaluation',
        evaluatedAt: now,
      };
    }

    // 2. Fetch User's Assigned Roles & Permissions in this Organisation
    const permissions = await this.db
      .selectFrom('membership_roles as mr')
      .innerJoin('roles as r', 'r.id', 'mr.role_id')
      .innerJoin('role_permissions as rp', 'rp.role_id', 'r.id')
      .innerJoin('permissions as p', 'p.id', 'rp.permission_id')
      .select(['r.code as roleCode', 'p.code as permissionCode'])
      .where('mr.membership_id', '=', req.membershipId)
      .where('mr.organisation_id', '=', req.organisationId)
      .execute();

    const matchedPermission = permissions.find((p) => p.permissionCode === req.requiredPermission);

    if (!matchedPermission) {
      return {
        allowed: false,
        reason: `Default Deny: Role does not grant permission ${req.requiredPermission}`,
        evaluatedAt: now,
      };
    }

    // 3. ABAC Scope Check
    // If resource specifies a branch, verify user's access scopes
    if (req.resourceAttributes?.branchId) {
      const branchScopes = await this.db
        .selectFrom('access_scopes')
        .select(['scope_type', 'scope_value'])
        .where('membership_id', '=', req.membershipId)
        .where('scope_type', 'in', ['organisation', 'branch'])
        .execute();

      const hasOrgWideScope = branchScopes.some((s) => s.scope_type === 'organisation' || s.scope_value === 'all');
      const hasSpecificBranch = branchScopes.some((s) => s.scope_type === 'branch' && s.scope_value === req.resourceAttributes?.branchId);

      if (!hasOrgWideScope && !hasSpecificBranch) {
        return {
          allowed: false,
          reason: `ABAC Deny: User scope restricted to other branches, access to ${req.resourceAttributes.branchId} blocked`,
          evaluatedAt: now,
        };
      }
    }

    // If resource specifies an assigned user, check ownership
    if (req.resourceAttributes?.assignedUserId && matchedPermission.roleCode === 'vendor_employee') {
      if (req.resourceAttributes.assignedUserId !== req.userId) {
        return {
          allowed: false,
          reason: 'ABAC Deny: Employee role restricted to assigned records only',
          evaluatedAt: now,
        };
      }
    }

    return {
      allowed: true,
      matchedRole: matchedPermission.roleCode,
      evaluatedAt: now,
    };
  }

  /**
   * Assign a role to an organisation member and trigger policy cache invalidation
   */
  async assignRole(cmd: AssignRoleCommand) {
    const result = await this.db.transaction().execute(async (trx) => {
      const assignment = await trx
        .insertInto('membership_roles')
        .values({
          id: crypto.randomUUID(),
          organisation_id: cmd.organisationId,
          membership_id: cmd.membershipId,
          role_id: cmd.roleId,
          assigned_by_user_id: cmd.assignedByUserId,
          assigned_at: new Date(),
        })
        .onConflict((oc) => oc.columns(['membership_id', 'role_id']).doUpdateSet({ assigned_at: new Date() }))
        .returningAll()
        .executeTakeFirstOrThrow();

      // Emit policy invalidation outbox event
      const eventPayload: PolicyInvalidatedEventPayload = {
        organisationId: cmd.organisationId,
        reason: 'role_updated',
        invalidatedAt: new Date().toISOString(),
      };

      const envelope = createEventEnvelope(
        KafkaTopics.ACCESS_CONTROL_POLICY_INVALIDATED,
        'aethra-access-control-service',
        {
          organisationId: cmd.organisationId,
          correlationId: cmd.correlationId,
        },
        eventPayload,
      );

      await trx
        .insertInto('outbox_events')
        .values({
          id: crypto.randomUUID(),
          event_type: KafkaTopics.ACCESS_CONTROL_POLICY_INVALIDATED,
          topic: KafkaTopics.ACCESS_CONTROL_POLICY_INVALIDATED,
          partition_key: cmd.organisationId,
          payload: envelope as unknown as Record<string, unknown>,
          correlation_id: cmd.correlationId,
          status: 'pending',
          retry_count: 0,
          created_at: new Date(),
        })
        .execute();

      return assignment;
    });

    logger.info({ membershipId: cmd.membershipId, roleId: cmd.roleId }, 'Role assigned and invalidation event queued');
    return result;
  }

  /**
   * Grant time-bound temporary privileged access (Emergency override)
   */
  async grantTemporaryAccess(cmd: GrantTemporaryAccessCommand) {
    const validUntil = new Date(Date.now() + cmd.durationMinutes * 60 * 1000);

    const grant = await this.db
      .insertInto('temporary_access_grants')
      .values({
        id: crypto.randomUUID(),
        organisation_id: cmd.organisationId,
        user_id: cmd.userId,
        permission_code: cmd.permissionCode,
        reason: cmd.reason,
        granted_by_user_id: cmd.grantedByUserId,
        valid_from: new Date(),
        valid_until: validUntil,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    logger.warn({ grantId: grant.id, userId: cmd.userId, permission: cmd.permissionCode }, 'Privileged temporary access granted');
    return grant;
  }
}
