# AETHRA — Event Catalogue

> Phase 0 · v0.1 · 2026-11-03

---

## 1. Conventions

### 1.1 Event Naming

```
{domain}.{entity}.{action}.v{version}
```

| Token | Rule | Example |
|-------|------|---------|
| `domain` | Snake-case bounded-context name | `identity`, `vendor_relationship` |
| `entity` | Singular noun, snake-case | `user`, `purchase_order` |
| `action` | Past-tense verb | `created`, `status_changed`, `assigned` |
| `version` | Monotonically increasing integer | `v1`, `v2` |

**Examples:**

- `identity.user.registered.v1`
- `quotation.quote.accepted.v1`
- `procurement.purchase_order.approved.v1`

### 1.2 Kafka Topic Naming

```
aethra.{domain}.{entity}.events
```

- One topic per aggregate root (entity).
- All event versions for that entity share the topic.
- Dead-letter topics: `aethra.{domain}.{entity}.events.dlq`
- Retry topics: `aethra.{domain}.{entity}.events.retry.{attempt}`

**Examples:**

| Topic | Events carried |
|-------|---------------|
| `aethra.identity.user.events` | `identity.user.registered.v1`, `identity.user.email_verified.v1`, … |
| `aethra.quotation.quote.events` | `quotation.quote.created.v1`, `quotation.quote.accepted.v1`, … |

### 1.3 Partition Key Strategy

| Domain / Entity | Partition Key | Rationale |
|-----------------|--------------|-----------|
| All tenant-scoped entities | `tenantId` | Ensures per-tenant ordering; co-locates tenant data on the same partition for downstream consumers |
| `identity.user.*` | `userId` | User lifecycle events must be ordered per user |
| `organisation.tenant.*` | `tenantId` | Tenant-level ordering |
| `quotation.quote.*` | `tenantId` | Tenant ordering; quote-level ordering handled at consumer via idempotency |
| `project.project.*` | `tenantId` | Same rationale |
| `inventory.stock.*` | `tenantId + warehouseId` | Warehouse-scoped ordering prevents cross-warehouse contention |
| `procurement.purchase_order.*` | `tenantId` | Tenant ordering |
| `audit.entry.*` | `tenantId` | Audit log ordering per tenant |

> [!NOTE]
> When tenant-level ordering is too coarse (hot partition risk for large tenants), a composite key like `tenantId:entityId` may be adopted. This is an **open decision** to be revisited after load testing.

### 1.4 Consumer Group Naming

```
aethra.{consuming-service}.{topic-short-name}
```

**Examples:**

| Consumer Service | Topic | Consumer Group |
|-----------------|-------|----------------|
| Access Control | `aethra.identity.user.events` | `aethra.access-control.identity-user` |
| Notification | `aethra.quotation.quote.events` | `aethra.notification.quotation-quote` |
| Audit | `aethra.identity.user.events` | `aethra.audit.identity-user` |

Each service gets its own consumer group per topic so that every service receives every event independently.

---

## 2. Event Catalogue by Domain

---

### 2.1 Identity Domain

**Producer:** Identity Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `identity.user.registered.v1` | A new user account has been created in the IdP and local store | `userId`, `email`, `phone`, `identityProviderRef`, `registrationType` (self, invited), `tenantId` (nullable for platform admins) | Organisation & Tenant, Access Control, Notification, Audit |
| `identity.user.email_verified.v1` | User's email address has been verified | `userId`, `email`, `verifiedAt` | Notification, Audit |
| `identity.user.phone_verified.v1` | User's phone number has been verified | `userId`, `phone`, `verifiedAt` | Notification, Audit |
| `identity.user.profile_updated.v1` | User updated their profile information | `userId`, `changedFields[]`, `updatedAt` | Customer (sync display name), Audit |
| `identity.user.password_changed.v1` | User changed or reset their password | `userId`, `changedAt`, `method` (self, admin_reset) | Notification, Audit |
| `identity.user.deactivated.v1` | User account has been deactivated | `userId`, `deactivatedBy`, `reason`, `deactivatedAt` | Access Control, Organisation & Tenant, Notification, Audit |
| `identity.user.reactivated.v1` | Previously deactivated user account restored | `userId`, `reactivatedBy`, `reactivatedAt` | Access Control, Organisation & Tenant, Notification, Audit |
| `identity.user.deleted.v1` | User account permanently deleted (GDPR/data retention) | `userId`, `deletedAt`, `anonymised` | All services (data cleanup), Audit |
| `identity.session.created.v1` | User logged in successfully | `userId`, `sessionId`, `ipAddress`, `userAgent`, `tenantId` | Audit |
| `identity.session.terminated.v1` | User session ended (logout or expiry) | `userId`, `sessionId`, `reason` | Audit |
| `identity.mfa.enabled.v1` | MFA was enabled for user | `userId`, `mfaMethod` | Notification, Audit |
| `identity.mfa.disabled.v1` | MFA was disabled for user | `userId`, `disabledBy` | Notification, Audit |

---

### 2.2 Organisation & Tenant Domain

**Producer:** Organisation & Tenant Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `organisation.tenant.provisioned.v1` | New tenant (vendor organisation) provisioned | `tenantId`, `organisationName`, `ownerUserId`, `plan`, `provisionedAt` | Access Control, Subscription & Entitlement, Notification, Audit |
| `organisation.tenant.settings_updated.v1` | Tenant-level settings changed | `tenantId`, `changedSettings{}`, `updatedBy` | Affected services (depends on setting), Audit |
| `organisation.tenant.suspended.v1` | Tenant suspended (billing, policy, or admin action) | `tenantId`, `reason`, `suspendedBy`, `suspendedAt` | All services (enforce read-only), Notification, Audit |
| `organisation.tenant.reactivated.v1` | Suspended tenant restored | `tenantId`, `reactivatedBy`, `reactivatedAt` | All services, Notification, Audit |
| `organisation.tenant.deleted.v1` | Tenant permanently deleted | `tenantId`, `deletedAt` | All services (data cleanup), Audit |
| `organisation.branch.created.v1` | A new branch/location added to tenant | `tenantId`, `branchId`, `name`, `address`, `gstNumber` | Inventory, Project Management, Audit |
| `organisation.branch.updated.v1` | Branch details updated | `tenantId`, `branchId`, `changedFields[]` | Inventory, Project Management, Audit |
| `organisation.branch.deactivated.v1` | Branch deactivated | `tenantId`, `branchId`, `deactivatedBy` | Inventory, Project Management, Audit |
| `organisation.member.added.v1` | User added as member of an organisation | `tenantId`, `userId`, `role`, `addedBy` | Access Control, Notification, Audit |
| `organisation.member.removed.v1` | User removed from an organisation | `tenantId`, `userId`, `removedBy`, `reason` | Access Control, Notification, Audit |
| `organisation.member.role_changed.v1` | Member's organisational role changed | `tenantId`, `userId`, `previousRole`, `newRole`, `changedBy` | Access Control, Audit |

---

### 2.3 Access Control Domain

**Producer:** Access Control Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `access_control.role.created.v1` | Custom role created within a tenant | `tenantId`, `roleId`, `roleName`, `permissions[]`, `createdBy` | Audit |
| `access_control.role.updated.v1` | Role permissions modified | `tenantId`, `roleId`, `addedPermissions[]`, `removedPermissions[]`, `updatedBy` | Audit |
| `access_control.role.deleted.v1` | Custom role deleted | `tenantId`, `roleId`, `deletedBy` | Audit |
| `access_control.assignment.granted.v1` | Role assigned to a user | `tenantId`, `userId`, `roleId`, `scope{}` (branch, project, etc.), `grantedBy` | Notification, Audit |
| `access_control.assignment.revoked.v1` | Role assignment revoked from a user | `tenantId`, `userId`, `roleId`, `revokedBy`, `reason` | Notification, Audit |
| `access_control.policy.evaluated.v1` | Access policy evaluation result (high-sensitivity auditing) | `tenantId`, `userId`, `resource`, `action`, `decision` (allow/deny), `policyId` | Audit |
| `access_control.cache.invalidated.v1` | Permission cache invalidation signal | `tenantId`, `userId` (nullable = all users in tenant), `invalidatedAt` | API Gateway, Web BFF, Mobile BFF |

---

### 2.4 Subscription & Entitlement Domain

**Producer:** Subscription & Entitlement Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `subscription.plan.created.v1` | New subscription plan defined (platform admin) | `planId`, `planName`, `features[]`, `limits{}` | Audit |
| `subscription.plan.updated.v1` | Plan features/limits changed | `planId`, `changedFields[]` | Tenants on plan (via tenant lookup), Audit |
| `subscription.subscription.activated.v1` | Tenant subscription activated or upgraded | `tenantId`, `subscriptionId`, `planId`, `validFrom`, `validUntil` | Organisation & Tenant, Access Control, Notification, Audit |
| `subscription.subscription.renewed.v1` | Subscription renewed | `tenantId`, `subscriptionId`, `renewedUntil` | Notification, Audit |
| `subscription.subscription.downgraded.v1` | Subscription downgraded to lower plan | `tenantId`, `subscriptionId`, `previousPlanId`, `newPlanId`, `effectiveAt` | Access Control (feature gates), Notification, Audit |
| `subscription.subscription.suspended.v1` | Subscription suspended (payment failure, etc.) | `tenantId`, `subscriptionId`, `reason`, `suspendedAt`, `gracePeriodEndsAt` | Organisation & Tenant, All services (enforce limits), Notification, Audit |
| `subscription.subscription.cancelled.v1` | Subscription cancelled | `tenantId`, `subscriptionId`, `cancelledBy`, `effectiveAt` | Organisation & Tenant, Notification, Audit |
| `subscription.entitlement.limit_approaching.v1` | Usage approaching plan limit (e.g., 80% projects used) | `tenantId`, `entitlement`, `currentUsage`, `limit`, `percentUsed` | Notification |
| `subscription.entitlement.limit_reached.v1` | Plan limit reached | `tenantId`, `entitlement`, `limit` | Notification, enforcing service |
| `subscription.payment.succeeded.v1` | Payment processed successfully | `tenantId`, `subscriptionId`, `amount`, `currency`, `invoiceId` | Notification, Audit |
| `subscription.payment.failed.v1` | Payment processing failed | `tenantId`, `subscriptionId`, `failureReason`, `retryAt` | Notification, Audit |

---

### 2.5 Customer Domain

**Producer:** Customer Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `customer.customer.created.v1` | New end-customer record created | `tenantId`, `customerId`, `name`, `email`, `phone`, `createdBy` | CRM, Notification, Audit |
| `customer.customer.updated.v1` | Customer details updated | `tenantId`, `customerId`, `changedFields[]`, `updatedBy` | CRM, Audit |
| `customer.customer.deactivated.v1` | Customer deactivated | `tenantId`, `customerId`, `deactivatedBy`, `reason` | CRM, Vendor Relationship, Audit |
| `customer.property.added.v1` | Property/site added under customer | `tenantId`, `customerId`, `propertyId`, `address`, `propertyType` | Quotation, Engineering & Estimation, Audit |
| `customer.property.updated.v1` | Property details updated | `tenantId`, `customerId`, `propertyId`, `changedFields[]` | Quotation, Engineering & Estimation, Audit |
| `customer.user_link.created.v1` | Customer linked to a user identity (portal access) | `tenantId`, `customerId`, `userId`, `accessLevel` | Identity, Access Control, Notification, Audit |
| `customer.user_link.revoked.v1` | Customer user link revoked | `tenantId`, `customerId`, `userId`, `revokedBy` | Access Control, Audit |

---

### 2.6 Vendor Relationship Domain

**Producer:** Vendor Relationship Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `vendor_relationship.relationship.created.v1` | Vendor-customer relationship established | `tenantId`, `vendorTenantId`, `customerId`, `relationshipId`, `grantedPermissions[]`, `createdBy` | Access Control, Customer, Notification, Audit |
| `vendor_relationship.relationship.updated.v1` | Relationship permissions or scope changed | `tenantId`, `relationshipId`, `changedPermissions[]`, `updatedBy` | Access Control, Audit |
| `vendor_relationship.relationship.revoked.v1` | Vendor-customer relationship revoked | `tenantId`, `relationshipId`, `revokedBy`, `reason`, `revokedAt` | Access Control, Customer, Quotation, Project Management, Notification, Audit |
| `vendor_relationship.invitation.sent.v1` | Invitation sent to customer to establish relationship | `tenantId`, `invitationId`, `customerId`, `invitedEmail`, `invitedBy` | Notification, Audit |
| `vendor_relationship.invitation.accepted.v1` | Customer accepted vendor invitation | `tenantId`, `invitationId`, `customerId`, `acceptedAt` | Access Control, Customer, Notification, Audit |
| `vendor_relationship.invitation.declined.v1` | Customer declined vendor invitation | `tenantId`, `invitationId`, `customerId`, `declinedAt` | Notification, Audit |
| `vendor_relationship.invitation.expired.v1` | Invitation expired without response | `tenantId`, `invitationId`, `expiredAt` | Audit |

---

### 2.7 CRM Domain

**Producer:** CRM Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `crm.lead.created.v1` | New lead/prospect captured | `tenantId`, `leadId`, `source`, `contactName`, `contactEmail`, `contactPhone`, `assignedTo`, `createdBy` | Notification, Audit |
| `crm.lead.updated.v1` | Lead details or status updated | `tenantId`, `leadId`, `changedFields[]`, `updatedBy` | Audit |
| `crm.lead.assigned.v1` | Lead assigned/reassigned to a team member | `tenantId`, `leadId`, `previousAssignee`, `newAssignee`, `assignedBy` | Notification, Audit |
| `crm.lead.qualified.v1` | Lead qualified (moved to opportunity stage) | `tenantId`, `leadId`, `qualifiedBy`, `qualificationCriteria{}` | Notification, Audit |
| `crm.lead.converted.v1` | Lead converted to customer and/or quotation | `tenantId`, `leadId`, `customerId` (nullable), `quotationId` (nullable), `convertedBy` | Customer, Quotation, Audit |
| `crm.lead.lost.v1` | Lead marked as lost | `tenantId`, `leadId`, `lostReason`, `competitor`, `markedBy` | Reporting & Analytics, Audit |
| `crm.activity.logged.v1` | Activity (call, meeting, email) logged against lead/customer | `tenantId`, `activityId`, `activityType`, `relatedEntityType`, `relatedEntityId`, `loggedBy` | Audit |
| `crm.pipeline.stage_changed.v1` | Lead moved to a different pipeline stage | `tenantId`, `leadId`, `previousStage`, `newStage`, `changedBy` | Reporting & Analytics, Audit |

---

### 2.8 Product Catalogue Domain

**Producer:** Product Catalogue Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `catalogue.product.created.v1` | New product added to catalogue | `tenantId`, `productId`, `sku`, `name`, `category`, `productType` (panel, inverter, etc.), `createdBy` | Inventory, Quotation, Engineering & Estimation, Audit |
| `catalogue.product.updated.v1` | Product details updated | `tenantId`, `productId`, `changedFields[]`, `updatedBy` | Inventory, Quotation, Engineering & Estimation, Audit |
| `catalogue.product.discontinued.v1` | Product discontinued | `tenantId`, `productId`, `discontinuedAt`, `replacementProductId` (nullable) | Inventory, Quotation, Engineering & Estimation, Audit |
| `catalogue.product.pricing_updated.v1` | Product pricing changed | `tenantId`, `productId`, `previousPrice`, `newPrice`, `effectiveFrom` | Quotation, Audit |
| `catalogue.category.created.v1` | Product category created | `tenantId`, `categoryId`, `name`, `parentCategoryId` | Audit |
| `catalogue.category.updated.v1` | Product category updated | `tenantId`, `categoryId`, `changedFields[]` | Audit |

---

### 2.9 Quotation Domain

**Producer:** Quotation Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `quotation.quote.created.v1` | New quotation created | `tenantId`, `quoteId`, `customerId`, `propertyId`, `createdBy`, `lineItems[]`, `totalAmount` | CRM, Notification, Audit |
| `quotation.quote.updated.v1` | Quotation revised | `tenantId`, `quoteId`, `version`, `changedFields[]`, `updatedBy` | CRM, Audit |
| `quotation.quote.sent.v1` | Quotation sent to customer | `tenantId`, `quoteId`, `customerId`, `sentVia` (email, portal), `sentAt` | Notification, Audit |
| `quotation.quote.viewed.v1` | Customer viewed the quotation | `tenantId`, `quoteId`, `viewedAt` | CRM, Notification, Audit |
| `quotation.quote.accepted.v1` | Customer accepted the quotation | `tenantId`, `quoteId`, `customerId`, `acceptedAt`, `lineItems[]`, `totalAmount` | Project Management, Inventory, Engineering & Estimation, Notification, Audit |
| `quotation.quote.rejected.v1` | Customer rejected the quotation | `tenantId`, `quoteId`, `customerId`, `rejectedAt`, `reason` | CRM, Notification, Audit |
| `quotation.quote.expired.v1` | Quotation validity period expired | `tenantId`, `quoteId`, `expiredAt` | CRM, Notification, Audit |
| `quotation.quote.cancelled.v1` | Quotation cancelled by vendor | `tenantId`, `quoteId`, `cancelledBy`, `reason` | CRM, Audit |

---

### 2.10 Engineering & Estimation Domain

**Producer:** Engineering & Estimation Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `engineering.design.created.v1` | System design created for a property/quote | `tenantId`, `designId`, `quoteId`, `propertyId`, `systemCapacityKw`, `createdBy` | Quotation, Document & File, Audit |
| `engineering.design.updated.v1` | Design revised | `tenantId`, `designId`, `version`, `changedFields[]`, `updatedBy` | Quotation, Document & File, Audit |
| `engineering.design.approved.v1` | Design approved for execution | `tenantId`, `designId`, `approvedBy`, `approvedAt` | Project Management, Quotation, Audit |
| `engineering.design.rejected.v1` | Design rejected (needs revision) | `tenantId`, `designId`, `rejectedBy`, `reason` | Notification, Audit |
| `engineering.bom.generated.v1` | Bill of Materials generated from design | `tenantId`, `designId`, `bomId`, `items[]` | Inventory, Procurement, Quotation, Audit |
| `engineering.estimation.completed.v1` | Cost/effort estimation completed | `tenantId`, `estimationId`, `designId`, `estimatedCost`, `estimatedDuration` | Quotation, Project Management, Audit |

---

### 2.11 Inventory Domain

**Producer:** Inventory Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `inventory.stock.received.v1` | Stock received into warehouse | `tenantId`, `warehouseId`, `receiptId`, `items[]` (productId, qty, batchNo), `purchaseOrderId`, `receivedBy` | Procurement, Audit |
| `inventory.stock.reserved.v1` | Stock reserved for a project/quote | `tenantId`, `warehouseId`, `reservationId`, `projectId`/`quoteId`, `items[]`, `reservedBy` | Project Management, Quotation, Audit |
| `inventory.stock.reservation_released.v1` | Stock reservation released | `tenantId`, `reservationId`, `releasedBy`, `reason` | Project Management, Audit |
| `inventory.stock.issued.v1` | Stock issued from warehouse (dispatched to site) | `tenantId`, `warehouseId`, `issueId`, `projectId`, `items[]`, `issuedBy` | Project Management, Audit |
| `inventory.stock.adjusted.v1` | Manual stock adjustment (count correction, damage, etc.) | `tenantId`, `warehouseId`, `adjustmentId`, `items[]`, `reason`, `adjustedBy` | Reporting & Analytics, Audit |
| `inventory.stock.low_stock_alert.v1` | Stock level below reorder point | `tenantId`, `warehouseId`, `productId`, `currentQty`, `reorderPoint` | Procurement, Notification |
| `inventory.stock.transferred.v1` | Stock transferred between warehouses | `tenantId`, `fromWarehouseId`, `toWarehouseId`, `transferId`, `items[]` | Audit |
| `inventory.warehouse.created.v1` | New warehouse created | `tenantId`, `warehouseId`, `name`, `branchId`, `createdBy` | Audit |

---

### 2.12 Procurement Domain

**Producer:** Procurement Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `procurement.purchase_order.created.v1` | New purchase order created | `tenantId`, `purchaseOrderId`, `supplierId`, `items[]`, `totalAmount`, `createdBy` | Notification, Audit |
| `procurement.purchase_order.approved.v1` | PO approved | `tenantId`, `purchaseOrderId`, `approvedBy`, `approvedAt` | Notification, Audit |
| `procurement.purchase_order.sent.v1` | PO sent to supplier | `tenantId`, `purchaseOrderId`, `sentAt`, `sentVia` | Audit |
| `procurement.purchase_order.acknowledged.v1` | Supplier acknowledged PO | `tenantId`, `purchaseOrderId`, `acknowledgedAt`, `expectedDeliveryDate` | Notification, Audit |
| `procurement.purchase_order.partially_received.v1` | Partial delivery received against PO | `tenantId`, `purchaseOrderId`, `receivedItems[]`, `pendingItems[]` | Inventory, Notification, Audit |
| `procurement.purchase_order.fully_received.v1` | All items received against PO | `tenantId`, `purchaseOrderId`, `receivedAt` | Inventory, Notification, Audit |
| `procurement.purchase_order.cancelled.v1` | PO cancelled | `tenantId`, `purchaseOrderId`, `cancelledBy`, `reason` | Inventory (release pending reservations), Notification, Audit |
| `procurement.supplier.created.v1` | Supplier record created | `tenantId`, `supplierId`, `name`, `contactInfo`, `createdBy` | Audit |
| `procurement.supplier.updated.v1` | Supplier record updated | `tenantId`, `supplierId`, `changedFields[]` | Audit |

---

### 2.13 Project Management Domain

**Producer:** Project Management Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `project.project.created.v1` | New project created (often from accepted quotation) | `tenantId`, `projectId`, `quoteId`, `customerId`, `propertyId`, `projectManager`, `createdBy` | Inventory, Engineering & Estimation, Notification, Audit |
| `project.project.updated.v1` | Project details updated | `tenantId`, `projectId`, `changedFields[]`, `updatedBy` | Audit |
| `project.project.status_changed.v1` | Project status changed (planning → in_progress → completed, etc.) | `tenantId`, `projectId`, `previousStatus`, `newStatus`, `changedBy` | Notification, Reporting & Analytics, Audit |
| `project.project.completed.v1` | Project marked as complete | `tenantId`, `projectId`, `completedAt`, `completedBy` | Service Management, Inventory (finalize reservations), Notification, Reporting & Analytics, Audit |
| `project.project.cancelled.v1` | Project cancelled | `tenantId`, `projectId`, `cancelledBy`, `reason` | Inventory (release reservations), Notification, Audit |
| `project.task.created.v1` | Task created within project | `tenantId`, `projectId`, `taskId`, `taskType`, `assignedTo`, `dueDate` | Notification, Audit |
| `project.task.assigned.v1` | Task assigned/reassigned | `tenantId`, `projectId`, `taskId`, `previousAssignee`, `newAssignee` | Notification, Audit |
| `project.task.completed.v1` | Task completed | `tenantId`, `projectId`, `taskId`, `completedBy`, `completedAt` | Notification, Audit |
| `project.milestone.reached.v1` | Project milestone reached | `tenantId`, `projectId`, `milestoneId`, `milestoneName`, `reachedAt` | Notification, Reporting & Analytics, Audit |
| `project.team_member.added.v1` | Team member added to project | `tenantId`, `projectId`, `userId`, `role`, `addedBy` | Access Control, Notification, Audit |
| `project.team_member.removed.v1` | Team member removed from project | `tenantId`, `projectId`, `userId`, `removedBy` | Access Control, Audit |

---

### 2.14 Document & File Domain

**Producer:** Document & File Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `document.file.uploaded.v1` | File uploaded | `tenantId`, `fileId`, `fileName`, `mimeType`, `sizeBytes`, `relatedEntityType`, `relatedEntityId`, `uploadedBy` | Audit |
| `document.file.deleted.v1` | File deleted | `tenantId`, `fileId`, `deletedBy` | Audit |
| `document.file.shared.v1` | File access granted to additional users | `tenantId`, `fileId`, `sharedWith[]`, `sharedBy` | Notification, Audit |
| `document.template.created.v1` | Document template created (proposal, invoice, etc.) | `tenantId`, `templateId`, `templateType`, `createdBy` | Audit |
| `document.document.generated.v1` | Document generated from template (e.g., proposal PDF) | `tenantId`, `documentId`, `templateId`, `relatedEntityType`, `relatedEntityId`, `generatedAt` | Notification, Audit |

---

### 2.15 Notification Domain

**Producer:** Notification Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `notification.notification.sent.v1` | Notification dispatched via a channel | `tenantId`, `notificationId`, `channel` (email, sms, push, in_app), `recipientUserId`, `templateId`, `sentAt` | Audit |
| `notification.notification.delivered.v1` | Delivery confirmation received from channel provider | `tenantId`, `notificationId`, `channel`, `deliveredAt` | Audit |
| `notification.notification.failed.v1` | Notification delivery failed | `tenantId`, `notificationId`, `channel`, `failureReason`, `willRetry` | Audit |
| `notification.preference.updated.v1` | User updated notification preferences | `tenantId`, `userId`, `preferences{}` | Audit |

> [!NOTE]
> The Notification service is primarily a **consumer** of events from other domains. It listens for business events to trigger notifications. The events it produces are about the notification lifecycle itself.

---

### 2.16 Service Management Domain

**Producer:** Service Management Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `service_management.ticket.created.v1` | Service/support ticket created (warranty, AMC, complaint) | `tenantId`, `ticketId`, `customerId`, `projectId`, `ticketType`, `priority`, `createdBy` | Notification, Audit |
| `service_management.ticket.assigned.v1` | Ticket assigned to technician/team | `tenantId`, `ticketId`, `assignedTo`, `assignedBy` | Notification, Audit |
| `service_management.ticket.status_changed.v1` | Ticket status updated | `tenantId`, `ticketId`, `previousStatus`, `newStatus`, `changedBy` | Notification, Audit |
| `service_management.ticket.resolved.v1` | Ticket resolved | `tenantId`, `ticketId`, `resolvedBy`, `resolution`, `resolvedAt` | Notification, Reporting & Analytics, Audit |
| `service_management.ticket.closed.v1` | Ticket closed (after customer confirmation or auto-close) | `tenantId`, `ticketId`, `closedAt` | Reporting & Analytics, Audit |
| `service_management.schedule.created.v1` | Maintenance/service visit scheduled | `tenantId`, `scheduleId`, `ticketId`, `scheduledDate`, `technicianId` | Notification, Audit |
| `service_management.schedule.completed.v1` | Scheduled visit completed | `tenantId`, `scheduleId`, `ticketId`, `completedAt`, `notes` | Notification, Audit |
| `service_management.warranty.activated.v1` | Warranty activated for installed system | `tenantId`, `warrantyId`, `projectId`, `productId`, `startDate`, `endDate` | Notification, Audit |
| `service_management.warranty.expiring.v1` | Warranty approaching expiry | `tenantId`, `warrantyId`, `expiresAt` | Notification, CRM |

---

### 2.17 Audit Domain

**Producer:** Audit Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `audit.entry.recorded.v1` | Audit entry persisted (confirmation event) | `tenantId`, `auditEntryId`, `sourceEvent`, `recordedAt` | (internal — typically not consumed externally) |
| `audit.export.completed.v1` | Audit log export completed | `tenantId`, `exportId`, `fileId`, `exportedBy`, `recordCount` | Notification |

> [!NOTE]
> The Audit service is primarily a **consumer**. It listens to events from all domains and persists audit records. It produces very few events of its own.

---

### 2.18 Reporting & Analytics Domain

**Producer:** Reporting & Analytics Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `reporting.report.generated.v1` | Report generated on demand or via schedule | `tenantId`, `reportId`, `reportType`, `generatedBy`, `fileId` | Notification, Audit |
| `reporting.dashboard.snapshot.v1` | Dashboard data snapshot refreshed | `tenantId`, `dashboardId`, `refreshedAt` | (internal) |
| `reporting.alert.triggered.v1` | Analytics-based alert triggered (e.g., conversion rate drop) | `tenantId`, `alertId`, `alertType`, `metric`, `threshold`, `actualValue` | Notification |

---

### 2.19 Integration Domain

**Producer:** Integration Service

| Event Name | Description | Key Payload Fields | Consumers |
|-----------|-------------|-------------------|-----------|
| `integration.webhook.received.v1` | Inbound webhook received from external system | `tenantId`, `integrationId`, `source`, `payload`, `receivedAt` | Target service (routed by integration config), Audit |
| `integration.sync.completed.v1` | Data sync with external system completed | `tenantId`, `integrationId`, `direction` (inbound/outbound), `recordCount`, `completedAt` | Notification, Audit |
| `integration.sync.failed.v1` | External sync failed | `tenantId`, `integrationId`, `failureReason`, `failedAt` | Notification, Audit |
| `integration.connection.established.v1` | Integration connection configured and verified | `tenantId`, `integrationId`, `provider`, `establishedBy` | Audit |
| `integration.connection.revoked.v1` | Integration connection removed | `tenantId`, `integrationId`, `revokedBy` | Audit |

---

## 3. Cross-Cutting Consumer Matrix

The following table summarises which services consume events from which domains:

| Consumer Service | Subscribed Domains |
|-----------------|-------------------|
| **Access Control** | identity, organisation, subscription, vendor_relationship, project |
| **Notification** | identity, organisation, subscription, customer, vendor_relationship, crm, quotation, inventory, procurement, project, service_management, reporting, audit |
| **Audit** | ALL domains |
| **Organisation & Tenant** | identity, subscription |
| **Customer** | identity, vendor_relationship, crm |
| **CRM** | customer, quotation |
| **Quotation** | catalogue, engineering, crm |
| **Engineering & Estimation** | customer, catalogue, quotation |
| **Inventory** | organisation, catalogue, procurement, project, quotation |
| **Procurement** | inventory (low stock alerts), engineering (BOM) |
| **Project Management** | organisation, quotation, inventory, engineering |
| **Service Management** | project |
| **Reporting & Analytics** | crm, project, service_management, inventory |
| **Document & File** | engineering |
| **Integration** | (configured per tenant — any domain) |
| **API Gateway / BFFs** | access_control (cache invalidation) |

---

## 4. Open Decisions

| # | Decision | Notes |
|---|----------|-------|
| 1 | **Partition key granularity** | `tenantId` vs. `tenantId:entityId` for large tenants — needs load testing data |
| 2 | **Topic compaction** | Whether entity-state topics (compacted) should complement event topics for materialised views |
| 3 | **Event ordering guarantees** | Strict per-tenant ordering vs. per-entity ordering trade-offs |
| 4 | **AI Service events** | AI Service is a future boundary; events TBD when scope is finalised |
| 5 | **Cross-tenant events** | Events that span tenant boundaries (e.g., customer accepting invitation across tenants) need special partition key treatment |
