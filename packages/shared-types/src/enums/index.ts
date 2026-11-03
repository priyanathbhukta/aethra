// ==============================================================================
// AETHRA — Shared Domain Enums
// ==============================================================================

export enum UserRole {
  PLATFORM_ADMIN = 'platform_admin',
  PLATFORM_SUPPORT = 'platform_support',
  VENDOR_OWNER = 'vendor_owner',
  VENDOR_ADMIN = 'vendor_admin',
  VENDOR_MANAGER = 'vendor_manager',
  VENDOR_EMPLOYEE = 'vendor_employee',
  CUSTOMER_OWNER = 'customer_owner',
  CUSTOMER_PROPERTY_USER = 'customer_property_user',
}

export enum OrganisationStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  SUSPENDED = 'suspended',
  CANCELLED = 'cancelled',
}

export enum BusinessCategory {
  MANUFACTURER = 'manufacturer',
  DISTRIBUTOR = 'distributor',
  RETAILER = 'retailer',
  SOLAR_EPC = 'solar_epc',
  INSTALLER = 'installer',
  OM_PROVIDER = 'om_provider',
  CONSULTANT = 'consultant',
  OTHER = 'other',
}

export enum RelationshipStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  REVOKED = 'revoked',
  TERMINATED = 'terminated',
}

export enum RelationshipPurposeCode {
  EPC_INSTALLATION = 'epc_installation',
  AMC_SERVICE = 'amc_service',
  ENERGY_AUDIT = 'energy_audit',
  MONITORING = 'monitoring',
  RETAIL_LEAD = 'retail_lead',
}

export enum QuotationStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  UNDER_REVIEW = 'under_review',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  SUPERSEDED = 'superseded',
}

export enum ProjectStatus {
  INITIATED = 'initiated',
  SITE_SURVEY = 'site_survey',
  ENGINEERING = 'engineering',
  PROCUREMENT = 'procurement',
  CONSTRUCTION = 'construction',
  INSPECTION = 'inspection',
  COMMISSIONED = 'commissioned',
  HANDOVER_COMPLETE = 'handover_complete',
  ON_HOLD = 'on_hold',
  CANCELLED = 'cancelled',
}

export enum StockMovementType {
  RECEIPT = 'receipt',
  ISSUE = 'issue',
  TRANSFER_IN = 'transfer_in',
  TRANSFER_OUT = 'transfer_out',
  ADJUSTMENT = 'adjustment',
  RETURN = 'return',
}

export enum ServiceTicketStatus {
  OPEN = 'open',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  PENDING_PARTS = 'pending_parts',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum ServiceTicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ModuleCode {
  IDENTITY = 'identity',
  ORGANISATION = 'organisation',
  ACCESS_CONTROL = 'access_control',
  SUBSCRIPTION = 'subscription',
  CUSTOMER = 'customer',
  VENDOR_RELATIONSHIP = 'vendor_relationship',
  CRM = 'crm',
  CATALOGUE = 'catalogue',
  QUOTATION = 'quotation',
  ENGINEERING = 'engineering',
  INVENTORY = 'inventory',
  PROCUREMENT = 'procurement',
  PROJECT = 'project',
  DOCUMENT = 'document',
  NOTIFICATION = 'notification',
  SERVICE_MANAGEMENT = 'service_management',
  REPORTING = 'reporting',
  INTEGRATION = 'integration',
  AUDIT = 'audit',
  AI = 'ai',
}
