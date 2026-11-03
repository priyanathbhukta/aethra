// ==============================================================================
// AETHRA — Testing Utilities & Mock Authentication Fixtures
// ==============================================================================

import { AuthenticatedUser, TenantContext, UserRole } from '@aethra/shared-types';

export function createMockTenant(overrides?: Partial<TenantContext>): TenantContext {
  return {
    organisationId: overrides?.organisationId || '11111111-1111-1111-1111-111111111111',
    organisationName: overrides?.organisationName || 'SunVolt Solar Solutions Pvt Ltd',
    isSuspended: overrides?.isSuspended ?? false,
    activeModules: overrides?.activeModules || ['crm', 'quotation', 'engineering', 'inventory', 'project'],
  };
}

export function createMockUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    userId: overrides?.userId || '22222222-2222-2222-2222-222222222222',
    email: overrides?.email || 'vikram@sunvolt.in',
    fullName: overrides?.fullName || 'Vikram Sharma',
    roles: overrides?.roles || [UserRole.VENDOR_OWNER],
    currentOrganisationId: overrides?.currentOrganisationId || '11111111-1111-1111-1111-111111111111',
    permissions: overrides?.permissions || [
      'crm.lead.create',
      'crm.lead.view_all',
      'quotation.create',
      'quotation.issue',
      'inventory.stock.view',
      'project.create',
    ],
  };
}
