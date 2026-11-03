// ==============================================================================
// AETHRA — Event Payload Contract Interfaces
// ==============================================================================

export interface UserRegisteredEventPayload {
  userId: string;
  email: string;
  fullName: string;
  phone?: string;
  registeredAt: string;
}

export interface OrganisationCreatedEventPayload {
  organisationId: string;
  legalName: string;
  tradeName?: string;
  ownerUserId: string;
  businessCategories: string[];
  createdAt: string;
}

export interface VendorRelationshipRevokedEventPayload {
  relationshipId: string;
  organisationId: string;
  customerId: string;
  propertyId?: string;
  installationId?: string;
  revocationReason: string;
  revokedByUserId: string;
  revokedAt: string;
}

export interface QuotationAcceptedEventPayload {
  quotationId: string;
  quotationNumber: string;
  revisionNumber: number;
  revisionId: string;
  organisationId: string;
  customerId: string;
  propertyId?: string;
  totalPayableAmount: number;
  acceptedByUserId: string;
  acceptedAt: string;
}

export interface StockReservedEventPayload {
  reservationId: string;
  organisationId: string;
  warehouseId: string;
  catalogueProductId: string;
  projectId: string;
  quantityReserved: number;
  reservedAt: string;
}

export interface ProjectCreatedEventPayload {
  projectId: string;
  projectCode: string;
  organisationId: string;
  customerId: string;
  propertyId: string;
  quotationId?: string;
  acceptedRevisionId?: string;
  capacityKw: number;
  projectManagerUserId: string;
  createdAt: string;
}

export interface PolicyInvalidatedEventPayload {
  organisationId: string;
  userId?: string;
  reason: 'role_updated' | 'membership_revoked' | 'relationship_revoked';
  invalidatedAt: string;
}
