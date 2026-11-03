// ==============================================================================
// AETHRA — Standard Kafka Topic Constants
// ==============================================================================

export const KafkaTopics = {
  // Identity & Org
  IDENTITY_USER_REGISTERED: 'identity.user.registered.v1',
  IDENTITY_USER_AUTHENTICATED: 'identity.user.authenticated.v1',
  ORGANISATION_CREATED: 'organisation.created.v1',
  ORGANISATION_MEMBERSHIP_CREATED: 'organisation.membership.created.v1',
  ORGANISATION_MEMBERSHIP_REVOKED: 'organisation.membership.revoked.v1',

  // Access Control & Subscription
  ACCESS_CONTROL_POLICY_INVALIDATED: 'access_control.policy.invalidated.v1',
  SUBSCRIPTION_ACTIVATED: 'subscription.activated.v1',
  SUBSCRIPTION_SUSPENDED: 'subscription.suspended.v1',
  SUBSCRIPTION_LIMIT_REACHED: 'subscription.limit_reached.v1',

  // Customer & Relationships
  CUSTOMER_CREATED: 'customer.created.v1',
  VENDOR_RELATIONSHIP_CREATED: 'vendor_relationship.created.v1',
  VENDOR_RELATIONSHIP_ACTIVATED: 'vendor_relationship.activated.v1',
  VENDOR_RELATIONSHIP_REVOKED: 'vendor_relationship.revoked.v1',

  // Pre-Sales
  CRM_LEAD_CONVERTED: 'crm.lead.converted.v1',
  CATALOGUE_PRICE_UPDATED: 'catalogue.price.updated.v1',
  QUOTATION_ISSUED: 'quotation.issued.v1',
  QUOTATION_ACCEPTED: 'quotation.accepted.v1',
  QUOTATION_ACCEPTED_DLQ: 'quotation.accepted.v1.dlq',
  ENGINEERING_ESTIMATE_COMPLETED: 'engineering.estimate.completed.v1',
  ENGINEERING_BOM_GENERATED: 'engineering.bom.generated.v1',

  // Operations
  INVENTORY_STOCK_RECEIVED: 'inventory.stock.received.v1',
  INVENTORY_STOCK_RESERVED: 'inventory.stock.reserved.v1',
  INVENTORY_STOCK_ISSUED: 'inventory.stock.issued.v1',
  PROCUREMENT_GOODS_RECEIPT_CONFIRMED: 'procurement.goods_receipt.confirmed.v1',
  PROJECT_CREATED: 'project.created.v1',
  PROJECT_MILESTONE_PUBLISHED: 'project.milestone.published.v1',
  PROJECT_HANDOVER_COMPLETED: 'project.handover.completed.v1',
  SERVICE_TICKET_CREATED: 'service.ticket.created.v1',
  DOCUMENT_UPLOAD_COMPLETED: 'document.upload.completed.v1',

  // Audit
  AUDIT_EVENTS: 'audit.events.v1',
} as const;

export type KafkaTopic = (typeof KafkaTopics)[keyof typeof KafkaTopics];
