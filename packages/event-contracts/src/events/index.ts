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

export interface CustomerCreatedEventPayload {
  customerId: string;
  accountType: 'individual' | 'commercial' | 'industrial' | 'society';
  legalName: string;
  displayName: string;
  primaryEmail: string;
  primaryPhone: string;
  status: string;
  createdAt: string;
}

export interface VendorRelationshipCreatedEventPayload {
  relationshipId: string;
  organisationId: string;
  customerId: string;
  purposeCode: string;
  status: string;
  initiatedAt: string;
}

export interface VendorRelationshipActivatedEventPayload {
  relationshipId: string;
  organisationId: string;
  customerId: string;
  purposeCode: string;
  status: string;
  activatedAt: string;
  expiresAt?: string;
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

export interface CrmLeadConvertedEventPayload {
  leadId: string;
  organisationId: string;
  leadCode: string;
  prospectName: string;
  prospectPhone: string;
  prospectEmail?: string;
  customerId?: string;
  quotationId?: string;
  convertedByUserId: string;
  convertedAt: string;
}

export interface CataloguePriceUpdatedEventPayload {
  catalogueEntryId: string;
  organisationId: string;
  modelId: string;
  vendorSku: string;
  oldStandardSellingPrice: number;
  newStandardSellingPrice: number;
  updatedAt: string;
}

export interface EngineeringEstimateCompletedEventPayload {
  estimateId: string;
  organisationId: string;
  estimateCode: string;
  customerId?: string;
  propertyId?: string;
  recommendedCapacityKw: number;
  annualGenerationKwh: number;
  calculatedAt: string;
}

export interface EngineeringBomGeneratedEventPayload {
  bomId: string;
  bomVersionId: string;
  estimateId: string;
  organisationId: string;
  versionNumber: number;
  itemCount: number;
  generatedAt: string;
}

export interface QuotationIssuedEventPayload {
  quotationId: string;
  revisionId: string;
  organisationId: string;
  quotationNumber: string;
  revisionNumber: number;
  customerId: string;
  propertyId?: string;
  totalPayableAmount: number;
  validUntil: string;
  issuedAt: string;
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

export interface SubscriptionActivatedEventPayload {
  subscriptionId: string;
  organisationId: string;
  planId: string;
  planCode: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  activatedAt: string;
}

export interface SubscriptionSuspendedEventPayload {
  subscriptionId: string;
  organisationId: string;
  reason: string;
  suspendedAt: string;
}

export interface SubscriptionLimitReachedEventPayload {
  subscriptionId: string;
  organisationId: string;
  featureCode: string;
  maxAllowed: number;
  currentUsage: number;
  reachedAt: string;
}

export interface AuditEventPayload {
  auditId: string;
  organisationId?: string;
  actorUserId?: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestCorrelationId?: string;
  clientIp?: string;
  userAgent?: string;
  recordedAt: string;
}


export interface StockReceivedEventPayload {
  receiptId: string;
  receiptCode: string;
  organisationId: string;
  warehouseId: string;
  catalogueProductId: string;
  quantity: number;
  unitCost: number;
  purchaseOrderId?: string;
  supplierId?: string;
  receivedAt: string;
}

export interface StockIssuedEventPayload {
  issueId: string;
  issueCode: string;
  organisationId: string;
  warehouseId: string;
  catalogueProductId: string;
  quantity: number;
  projectId?: string;
  reservationId?: string;
  issuedToUserId: string;
  issuedAt: string;
}

export interface GoodsReceiptConfirmedEventPayload {
  grnId: string;
  grnCode: string;
  organisationId: string;
  poId: string;
  supplierId: string;
  destinationWarehouseId: string;
  deliveryChallanNumber: string;
  itemCount: number;
  receivedAt: string;
}

export interface ProjectMilestonePublishedEventPayload {
  milestoneId: string;
  projectId: string;
  organisationId: string;
  milestoneName: string;
  status: string;
  overallProgressPercentage: number;
  publishedAt: string;
}

export interface ProjectHandoverCompletedEventPayload {
  handoverId: string;
  projectId: string;
  organisationId: string;
  customerId: string;
  propertyId: string;
  capacityKw: number;
  handoverDate: string;
  commissioningReportDocId: string;
  completedAt: string;
}

export interface ServiceTicketCreatedEventPayload {
  ticketId: string;
  ticketNumber: string;
  organisationId: string;
  customerId: string;
  propertyId: string;
  installationId?: string;
  ticketType: string;
  priority: string;
  createdAt: string;
}
