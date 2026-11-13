// ==============================================================================
// AETHRA — Common API Request & Response DTOs
// ==============================================================================

export interface CreateOrganisationDto {
  legalName: string;
  tradeName?: string;
  businessCategories: string[];
  contactEmail: string;
  contactPhone: string;
  panTaxId?: string;
  gstNumber?: string;
}

export interface CreateLeadDto {
  prospectName: string;
  prospectPhone: string;
  prospectEmail?: string;
  prospectType?: 'residential' | 'commercial' | 'industrial' | 'agricultural';
  leadSourceId?: string;
  proposedCapacityKw?: number;
  siteCity?: string;
  siteState?: string;
}

export interface QuotationLineItemInput {
  itemType: 'product' | 'service' | 'labour' | 'freight' | 'bos_package';
  catalogueProductId?: string;
  itemDescription: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRatePercent?: number;
}

export interface CreateQuotationDto {
  title: string;
  customerId: string;
  propertyId?: string;
  leadId?: string;
  engineeringEstimateId?: string;
  validDays?: number;
  lines: QuotationLineItemInput[];
}

export interface CustomerAcceptQuotationDto {
  decision: 'accept' | 'reject' | 'request_changes';
  comments?: string;
  signatureType?: 'digital_click' | 'otp_verified' | 'signed_scan';
  signatureToken?: string;
}

export interface PostStockMovementDto {
  warehouseId: string;
  catalogueProductId: string;
  movementType: 'receipt' | 'issue' | 'transfer_in' | 'transfer_out' | 'adjustment' | 'return';
  quantity: number;
  unitCost: number;
  referenceDocType: string;
  referenceDocId: string;
  batchCode?: string;
  serialNumbers?: string[];
}

export interface ActivateSubscriptionDto {
  organisationId: string;
  planId: string;
  billingContactEmail?: string;
  paymentMetadata?: Record<string, unknown>;
}

export interface RecordUsageDto {
  organisationId: string;
  featureCode: string;
  quantity: number;
  idempotencyKey: string;
  recordedBy?: string;
}

export interface CreateAuditEventDto {
  organisationId?: string;
  actorUserId?: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestCorrelationId?: string;
  clientIp?: string;
  userAgent?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  result?: 'success' | 'failure' | 'denied';
}
