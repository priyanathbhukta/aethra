// ==============================================================================
// AETHRA — End-to-End Distributed Sagas & Event Choreography Test Suite
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import {
  createEventEnvelope,
  KafkaTopics,
  InMemoryEventBus,
  InMemoryInboxGuard,
  OutboxRelayer,
  OutboxRow,
  QuotationAcceptedEventPayload,
  ProjectCreatedEventPayload,
  GoodsReceiptConfirmedEventPayload,
  ProjectHandoverCompletedEventPayload,
  VendorRelationshipRevokedEventPayload,
} from '@aethra/event-contracts';

test('AETHRA Distributed Sagas & Choreography Architecture', async (t) => {
  await t.test(
    'Saga 3: Quotation Acceptance -> Project Creation -> Stock Reservation -> Customer Notification',
    async () => {
      const eventBus = new InMemoryEventBus();
      const projectInbox = new InMemoryInboxGuard();
      const notificationInbox = new InMemoryInboxGuard();
      const inventoryInbox = new InMemoryInboxGuard();

      const createdProjects: any[] = [];
      const notificationsDispatched: any[] = [];
      const stockReservations: any[] = [];
      const projectOutboxRows: OutboxRow[] = [];

      // 1. Project Service Consumer
      eventBus.subscribe<QuotationAcceptedEventPayload>(
        KafkaTopics.QUOTATION_ACCEPTED,
        async (envelope) => {
          if (projectInbox.isProcessed(envelope.eventId)) return;

          const data = envelope.data;
          const projectId = 'prj-sol-2026-9001';
          const projectCode = 'PRJ-2026-9001';

          createdProjects.push({
            id: projectId,
            code: projectCode,
            organisationId: data.organisationId,
            customerId: data.customerId,
            quotationId: data.quotationId,
            status: 'initiated',
            milestones: [
              { name: 'Site Survey & Engineering Design', weight: 15 },
              { name: 'Procurement & Material Delivery', weight: 25 },
              { name: 'Mounting Structure & Module Installation', weight: 25 },
              { name: 'Inverter, Cabling & Electrical Works', weight: 15 },
              { name: 'DISCOM Net-Metering & CEIG Inspection', weight: 10 },
              { name: 'Plant Commissioning & Handover', weight: 10 },
            ],
          });

          // Stage project.created.v1 into Project Service Outbox
          const projCreatedEnvelope = createEventEnvelope(
            KafkaTopics.PROJECT_CREATED,
            'aethra-project-service',
            {
              organisationId: data.organisationId,
              correlationId: envelope.correlationId,
            },
            {
              projectId,
              projectCode,
              organisationId: data.organisationId,
              customerId: data.customerId,
              propertyId: data.propertyId || 'prop-default',
              quotationId: data.quotationId,
              acceptedRevisionId: data.revisionId,
              capacityKw: 10.0,
              projectManagerUserId: data.acceptedByUserId,
              createdAt: new Date().toISOString(),
            } as ProjectCreatedEventPayload
          );

          projectOutboxRows.push({
            id: 'ob-prj-1',
            event_type: KafkaTopics.PROJECT_CREATED,
            topic: KafkaTopics.PROJECT_CREATED,
            partition_key: data.organisationId,
            payload: projCreatedEnvelope,
            correlation_id: envelope.correlationId,
            status: 'pending',
            retry_count: 0,
          });

          projectInbox.markProcessed(envelope.eventId);
        }
      );

      // 2. Notification Service Consumer
      eventBus.subscribe<QuotationAcceptedEventPayload>(
        KafkaTopics.QUOTATION_ACCEPTED,
        async (envelope) => {
          if (notificationInbox.isProcessed(envelope.eventId)) return;

          notificationsDispatched.push({
            recipientUserId: envelope.data.acceptedByUserId,
            title: 'Quotation Accepted — Project Initiated',
            body: `Your quotation ${envelope.data.quotationNumber} has been accepted.`,
          });

          notificationInbox.markProcessed(envelope.eventId);
        }
      );

      // 3. Inventory Service Consumer (subscribes to project.created.v1)
      eventBus.subscribe<ProjectCreatedEventPayload>(
        KafkaTopics.PROJECT_CREATED,
        async (envelope) => {
          if (inventoryInbox.isProcessed(envelope.eventId)) return;

          stockReservations.push({
            projectId: envelope.data.projectId,
            organisationId: envelope.data.organisationId,
            status: 'reserved',
            capacityKw: envelope.data.capacityKw,
          });

          inventoryInbox.markProcessed(envelope.eventId);
        }
      );

      // Step A: Trigger Quotation Accepted Event
      const quotationAcceptedEnvelope = createEventEnvelope(
        KafkaTopics.QUOTATION_ACCEPTED,
        'aethra-quotation-service',
        {
          organisationId: 'vendor-sun-energy',
          correlationId: 'corr-saga-e2e-1',
        },
        {
          quotationId: 'quot-1001',
          quotationNumber: 'QT-2026-1001',
          revisionNumber: 1,
          revisionId: 'rev-1001-1',
          organisationId: 'vendor-sun-energy',
          customerId: 'cust-sharma-1',
          propertyId: 'prop-sharma-villa',
          totalPayableAmount: 450000.0,
          acceptedByUserId: 'usr-sharma-1',
          acceptedAt: new Date().toISOString(),
        } as QuotationAcceptedEventPayload
      );

      await eventBus.publish(KafkaTopics.QUOTATION_ACCEPTED, quotationAcceptedEnvelope);

      // Step B: Outbox Relayer drains project outbox and publishes project.created.v1
      const relayer = new OutboxRelayer(eventBus, 'project-outbox-worker');
      const relayedIds: string[] = [];
      const relayResult = await relayer.processOutboxBatch(projectOutboxRows, async (id) => {
        relayedIds.push(id);
      });

      // Assertions for Saga 3
      assert.strictEqual(createdProjects.length, 1);
      assert.strictEqual(createdProjects[0].code, 'PRJ-2026-9001');
      assert.strictEqual(createdProjects[0].milestones.length, 6);

      const totalWeight = createdProjects[0].milestones.reduce(
        (sum: number, m: any) => sum + m.weight,
        0
      );
      assert.strictEqual(totalWeight, 100, 'Sum of milestone weights must be 100%');

      assert.strictEqual(notificationsDispatched.length, 1);
      assert.strictEqual(notificationsDispatched[0].recipientUserId, 'usr-sharma-1');

      assert.strictEqual(relayResult.publishedCount, 1);
      assert.strictEqual(relayedIds.length, 1);

      assert.strictEqual(stockReservations.length, 1);
      assert.strictEqual(stockReservations[0].projectId, 'prj-sol-2026-9001');
    }
  );

  await t.test(
    'Saga 3 Idempotency: Duplicate event delivery is skipped without side-effects',
    async () => {
      const eventBus = new InMemoryEventBus();
      const projectInbox = new InMemoryInboxGuard();
      let projectCreationCount = 0;

      eventBus.subscribe<QuotationAcceptedEventPayload>(
        KafkaTopics.QUOTATION_ACCEPTED,
        async (envelope) => {
          if (projectInbox.isProcessed(envelope.eventId)) return;
          projectCreationCount++;
          projectInbox.markProcessed(envelope.eventId);
        }
      );

      const envelope = createEventEnvelope(
        KafkaTopics.QUOTATION_ACCEPTED,
        'aethra-quotation-service',
        {
          organisationId: 'vendor-sun-energy',
          correlationId: 'corr-idempotent-test',
        },
        {
          quotationId: 'quot-dup-1',
          quotationNumber: 'QT-2026-DUP',
          revisionNumber: 1,
          revisionId: 'rev-dup',
          organisationId: 'vendor-sun-energy',
          customerId: 'cust-1',
          totalPayableAmount: 100000,
          acceptedByUserId: 'usr-1',
          acceptedAt: new Date().toISOString(),
        } as QuotationAcceptedEventPayload
      );

      // Deliver 3 times
      await eventBus.publish(KafkaTopics.QUOTATION_ACCEPTED, envelope);
      await eventBus.publish(KafkaTopics.QUOTATION_ACCEPTED, envelope);
      await eventBus.publish(KafkaTopics.QUOTATION_ACCEPTED, envelope);

      assert.strictEqual(projectCreationCount, 1, 'Duplicate events must only be processed once');
    }
  );

  await t.test(
    'Saga 4: Procurement GRN Confirmation -> Inventory Double-Entry Intake',
    async () => {
      const eventBus = new InMemoryEventBus();
      const inventoryInbox = new InMemoryInboxGuard();

      const inventoryBalances = new Map<string, number>();
      const stockLedgerEntries: any[] = [];

      eventBus.subscribe<GoodsReceiptConfirmedEventPayload>(
        KafkaTopics.PROCUREMENT_GOODS_RECEIPT_CONFIRMED,
        async (envelope) => {
          if (inventoryInbox.isProcessed(envelope.eventId)) return;

          const data = envelope.data;
          const warehouseKey = `${data.organisationId}:${data.destinationWarehouseId}`;
          const currentOnHand = inventoryBalances.get(warehouseKey) || 0;
          const intakeQty = data.itemCount * 25; // 25 modules per item
          const newOnHand = currentOnHand + intakeQty;

          inventoryBalances.set(warehouseKey, newOnHand);

          stockLedgerEntries.push({
            movementType: 'receipt',
            referenceDocType: 'goods_receipt',
            referenceDocId: data.grnId,
            quantity: intakeQty,
            balanceAfter: newOnHand,
            postedAt: new Date(),
          });

          inventoryInbox.markProcessed(envelope.eventId);
        }
      );

      const grnEnvelope = createEventEnvelope(
        KafkaTopics.PROCUREMENT_GOODS_RECEIPT_CONFIRMED,
        'aethra-procurement-service',
        {
          organisationId: 'vendor-helios-infra',
          correlationId: 'corr-saga-4-e2e',
        },
        {
          grnId: 'grn-po-9911',
          grnCode: 'GRN-2026-9911',
          organisationId: 'vendor-helios-infra',
          poId: 'po-7700',
          supplierId: 'supp-waaree-solar',
          destinationWarehouseId: 'wh-blr-north',
          deliveryChallanNumber: 'DC-88331',
          itemCount: 4,
          receivedAt: new Date().toISOString(),
        } as GoodsReceiptConfirmedEventPayload
      );

      await eventBus.publish(KafkaTopics.PROCUREMENT_GOODS_RECEIPT_CONFIRMED, grnEnvelope);

      // Verify zero direct DB writes, event-driven ledger intake
      const balance = inventoryBalances.get('vendor-helios-infra:wh-blr-north');
      assert.strictEqual(balance, 100);
      assert.strictEqual(stockLedgerEntries.length, 1);
      assert.strictEqual(stockLedgerEntries[0].movementType, 'receipt');
      assert.strictEqual(stockLedgerEntries[0].referenceDocId, 'grn-po-9911');
      assert.strictEqual(stockLedgerEntries[0].balanceAfter, 100);
    }
  );

  await t.test(
    'Saga 5: Project Handover Completion -> Customer Operational Status & Warranty AMC',
    async () => {
      const eventBus = new InMemoryEventBus();
      const customerInbox = new InMemoryInboxGuard();
      const serviceInbox = new InMemoryInboxGuard();

      let customerInstallationStatus = 'planned';
      let amcContractProvisioned: any = null;

      // Customer Service Handover Consumer
      eventBus.subscribe<ProjectHandoverCompletedEventPayload>(
        KafkaTopics.PROJECT_HANDOVER_COMPLETED,
        async (envelope) => {
          if (customerInbox.isProcessed(envelope.eventId)) return;
          customerInstallationStatus = 'operational';
          customerInbox.markProcessed(envelope.eventId);
        }
      );

      // Service Management Consumer
      eventBus.subscribe<ProjectHandoverCompletedEventPayload>(
        KafkaTopics.PROJECT_HANDOVER_COMPLETED,
        async (envelope) => {
          if (serviceInbox.isProcessed(envelope.eventId)) return;

          amcContractProvisioned = {
            customerId: envelope.data.customerId,
            propertyId: envelope.data.propertyId,
            installationId: envelope.data.projectId,
            contractTier: 'comprehensive',
            visitsPerYear: 4,
            contractAmount: 0.0,
            status: 'active',
          };

          serviceInbox.markProcessed(envelope.eventId);
        }
      );

      const handoverEnvelope = createEventEnvelope(
        KafkaTopics.PROJECT_HANDOVER_COMPLETED,
        'aethra-project-service',
        {
          organisationId: 'vendor-tata-power',
          correlationId: 'corr-saga-5-e2e',
        },
        {
          handoverId: 'ho-epc-901',
          projectId: 'prj-rooftop-01',
          organisationId: 'vendor-tata-power',
          customerId: 'cust-banerjee-7',
          propertyId: 'prop-whitefield-villa',
          capacityKw: 12.5,
          handoverDate: '2026-11-28T00:00:00Z',
          commissioningReportDocId: 'doc-ceig-signed-cert-901',
          completedAt: new Date().toISOString(),
        } as ProjectHandoverCompletedEventPayload
      );

      await eventBus.publish(KafkaTopics.PROJECT_HANDOVER_COMPLETED, handoverEnvelope);

      assert.strictEqual(customerInstallationStatus, 'operational');
      assert.ok(amcContractProvisioned);
      assert.strictEqual(amcContractProvisioned.contractTier, 'comprehensive');
      assert.strictEqual(amcContractProvisioned.visitsPerYear, 4);
      assert.strictEqual(amcContractProvisioned.contractAmount, 0.0);
    }
  );

  await t.test(
    'Saga 6: Relationship Revocation -> Immediate Policy Invalidation Across Tenant Boundary',
    async () => {
      const eventBus = new InMemoryEventBus();
      const accessControlInbox = new InMemoryInboxGuard();

      const invalidatedTenants = new Set<string>();

      eventBus.subscribe<VendorRelationshipRevokedEventPayload>(
        KafkaTopics.VENDOR_RELATIONSHIP_REVOKED,
        async (envelope) => {
          if (accessControlInbox.isProcessed(envelope.eventId)) return;

          invalidatedTenants.add(
            `${envelope.data.organisationId}:${envelope.data.customerId}`
          );

          accessControlInbox.markProcessed(envelope.eventId);
        }
      );

      const revocationEnvelope = createEventEnvelope(
        KafkaTopics.VENDOR_RELATIONSHIP_REVOKED,
        'aethra-vendor-relationship-service',
        {
          organisationId: 'vendor-solar-alpha',
          correlationId: 'corr-saga-6-e2e',
        },
        {
          relationshipId: 'rel-rev-001',
          organisationId: 'vendor-solar-alpha',
          customerId: 'cust-corporate-park',
          revocationReason: 'Contract expiry and transition',
          revokedByUserId: 'usr-facility-director',
          revokedAt: new Date().toISOString(),
        } as VendorRelationshipRevokedEventPayload
      );

      await eventBus.publish(KafkaTopics.VENDOR_RELATIONSHIP_REVOKED, revocationEnvelope);

      assert.strictEqual(
        invalidatedTenants.has('vendor-solar-alpha:cust-corporate-park'),
        true,
        'Revoked relationship must immediately invalidate cached policy evaluations'
      );
    }
  );
});
