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

export interface CreateProductModelDto {
  categoryId: string;
  brandId: string;
  modelCode: string;
  displayName: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface SetVendorPricingDto {
  organisationId: string;
  modelId: string;
  vendorSku: string;
  standardCostPrice: number;
  standardSellingPrice: number;
  minSellingPrice?: number;
  taxRatePercent?: number;
  isAvailable?: boolean;
}

export interface RunEngineeringEstimateDto {
  organisationId: string;
  customerId?: string;
  propertyId?: string;
  leadId?: string;
  profileCode?: string;
  sanctionLoadKw: number;
  usableAreaSqm: number;
  tiltAngleDeg?: number;
  azimuthDeg?: number;
  discomMonthlyUnits?: number;
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

export interface CreateCustomerDto {
  accountType?: 'individual' | 'commercial' | 'industrial' | 'society';
  legalName: string;
  displayName?: string;
  primaryEmail: string;
  primaryPhone: string;
  alternatePhone?: string;
  panTaxId?: string;
  gstNumber?: string;
  languagePreference?: string;
}

export interface CreateCustomerPropertyDto {
  propertyName: string;
  propertyType: 'residential' | 'commercial' | 'industrial' | 'agricultural';
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  discomName?: string;
  consumerNumber?: string;
  sanctionedLoadKw?: number;
  tariffRate?: number;
}

export interface CreatePropertyInstallationDto {
  installationName: string;
  systemType: 'solar_rooftop' | 'solar_ground' | 'bess' | 'ev_charging' | 'hybrid';
  gridType?: 'on_grid' | 'off_grid' | 'hybrid' | 'microgrid';
  capacityKw: number;
}

export interface InitiateRelationshipDto {
  organisationId: string;
  customerId: string;
  purposeCode: string;
  metadata?: Record<string, unknown>;
}

export interface AcceptConsentDto {
  relationshipId: string;
  userId: string;
  consentVersion: string;
  consentMethod?: 'digital_signature' | 'otp_confirmation' | 'contract_upload';
  ipAddress: string;
  userAgent: string;
}

export interface GrantPropertyAccessDto {
  relationshipId: string;
  propertyId: string;
  accessScope?: 'read_only' | 'read_write' | 'engineering_only';
}

export interface RevokeRelationshipDto {
  relationshipId: string;
  revocationReason: string;
  revokedByUserId: string;
  revokedByRole?: 'customer_owner' | 'vendor_owner' | 'platform_admin' | 'system_auto';
  propertyId?: string;
  installationId?: string;
}
