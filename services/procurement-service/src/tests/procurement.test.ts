// ==============================================================================
// AETHRA Procurement Service — Supplier, PO, GRN & 3-Way Matching Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { ProcurementApplicationService } from '../application/procurement.service.js';

test('Procurement Service — Purchase Order Lifecycle & 3-Way Matching Audit', async (t) => {
  await t.test('Scenario 1: Creates supplier master and auto-generates supplier code', async () => {
    let createdSupplier: any = null;

    const mockDb: any = {
      insertInto: () => ({
        values: (vals: any) => {
          createdSupplier = vals;
          return {
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => vals,
            }),
          };
        },
      }),
    };

    const service = new ProcurementApplicationService(mockDb);
    const supplier = await service.createSupplier({
      organisationId: 'vendor-sunvolt-01',
      legalName: 'Waaree Energies Limited',
      tradeName: 'Waaree Solar',
      gstNumber: '27AABCV1234F1Z8',
      panTaxId: 'AABCV1234F',
      contactPerson: 'Suresh Patel',
      email: 'sales@waaree.com',
      phone: '+919876543210',
      address: 'Plot 12, Industrial Area',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400093',
    });

    assert.ok(supplier);
    assert.strictEqual(supplier.legal_name, 'Waaree Energies Limited');
    assert.match(supplier.supplier_code, /^SUP-\d{4}-\d{4}$/);
    assert.strictEqual(createdSupplier.gst_number, '27AABCV1234F1Z8');
  });

  await t.test('Scenario 2: Creates purchase order and computes line subtotals, GST, and total payable', async () => {
    let createdPo: any = null;
    const poLines: any[] = [];

    const mockDb: any = {
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                if (table === 'purchase_orders') createdPo = vals;
                if (table === 'purchase_order_lines') poLines.push(vals);
                return {
                  returningAll: () => ({
                    executeTakeFirstOrThrow: async () => vals,
                  }),
                  execute: async () => {},
                };
              },
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new ProcurementApplicationService(mockDb);
    const result = await service.createPurchaseOrder({
      organisationId: 'vendor-sunvolt-01',
      supplierId: 'sup-waaree-01',
      destinationWarehouseId: 'wh-blr-01',
      expectedDeliveryDate: '2026-12-15T00:00:00Z',
      paymentTerms: 'net_30',
      shippingTerms: 'fob_site',
      createdByUserId: 'usr-procurement-mgr',
      correlationId: 'corr-po-101',
      lines: [
        {
          catalogueProductId: 'prod-solar-panel-550w',
          itemDescription: '550W Mono PERC Solar PV Modules (100 Nos)',
          orderedQuantity: 100,
          unit: 'NOS',
          unitPrice: 15000,
          taxRatePercent: 13.8, // 100 * 15,000 = 1,500,000; Tax @ 13.8% = 207,000
        },
        {
          catalogueProductId: 'prod-inverter-50kw',
          itemDescription: '50kW 3-Phase Grid-Tied Inverter',
          orderedQuantity: 1,
          unit: 'NOS',
          unitPrice: 220000,
          taxRatePercent: 18.0, // 1 * 220,000 = 220,000; Tax @ 18% = 39,600
        },
      ],
    });

    assert.ok(result);
    assert.ok(createdPo);
    assert.strictEqual(result.po.status, 'draft');
    assert.match(result.po.po_number, /^PO-\d{4}-\d{4}$/);
    assert.strictEqual(poLines.length, 2);

    // Subtotal = 1,500,000 + 220,000 = 1,720,000
    // Total Tax = 207,000 + 39,600 = 246,600
    // Total Amount = 1,966,600
    assert.strictEqual(result.po.subtotal_amount, 1720000);
    assert.strictEqual(result.po.tax_amount, 246600);
    assert.strictEqual(result.po.total_amount, 1966600);
  });

  await t.test('Scenario 3: Finalizes Goods Receipt (GRN) and dispatches procurement.goods_receipt.confirmed.v1 event', async () => {
    const poRecord: any = {
      id: 'po-001',
      po_number: 'PO-2026-1001',
      organisation_id: 'vendor-sunvolt-01',
      status: 'issued',
    };

    const poLines: any[] = [
      {
        id: 'line-001',
        po_id: 'po-001',
        ordered_quantity: 100,
        received_quantity: 0,
      },
    ];

    const outboxEvents: any[] = [];
    const grnLines: any[] = [];

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            where: () => ({
              executeTakeFirst: async () => poRecord,
            }),
          }),
        }),
      }),
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                if (table === 'goods_receipt_lines') grnLines.push(vals);
                if (table === 'outbox_events') outboxEvents.push(vals);
                return {
                  returningAll: () => ({
                    executeTakeFirstOrThrow: async () => vals,
                  }),
                  execute: async () => {},
                };
              },
            }),
            updateTable: (_table: string) => ({
              set: (_setter: any) => ({
                where: () => ({
                  execute: async () => {},
                }),
              }),
            }),
            selectFrom: () => ({
              selectAll: () => ({
                where: () => ({
                  execute: async () => [{ ...poLines[0], received_quantity: 100 }],
                }),
              }),
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new ProcurementApplicationService(mockDb);
    const result = await service.recordGoodsReceipt({
      organisationId: 'vendor-sunvolt-01',
      poId: 'po-001',
      supplierId: 'sup-waaree-01',
      destinationWarehouseId: 'wh-blr-01',
      deliveryChallanNumber: 'DC-88419',
      transporterName: 'VRL Logistics',
      vehicleNumber: 'KA-01-AB-1234',
      inspectedByUserId: 'usr-quality-eng',
      correlationId: 'corr-grn-101',
      lines: [
        {
          poLineId: 'line-001',
          catalogueProductId: 'prod-solar-panel-550w',
          quantityDelivered: 100,
          quantityAccepted: 100,
          quantityRejected: 0,
          batchCode: 'WAAREE-LOT-2026-A',
        },
      ],
    });

    assert.ok(result);
    assert.strictEqual(result.poStatus, 'fully_received');
    assert.strictEqual(grnLines.length, 1);
    assert.strictEqual(outboxEvents.length, 1);
    assert.strictEqual(outboxEvents[0].event_type, 'procurement.goods_receipt.confirmed.v1');
    assert.strictEqual(outboxEvents[0].payload.data.poId, 'po-001');
    assert.strictEqual(outboxEvents[0].payload.data.itemCount, 1);
  });

  await t.test('Scenario 4: 3-Way Matching audit verifies matched invoice within tolerance', async () => {
    const poRecord = {
      id: 'po-001',
      po_number: 'PO-2026-1001',
      total_amount: 1707000,
    };

    // 100 panels * 15,000 + 13.8% tax = 1,707,000
    const mockDb: any = {
      selectFrom: (table: string) => ({
        selectAll: () => ({
          where: () => ({
            where: () => ({
              executeTakeFirst: async () => (table === 'purchase_orders' ? poRecord : null),
            }),
          }),
        }),
        innerJoin: () => ({
          innerJoin: () => ({
            select: () => ({
              where: () => ({
                where: () => ({
                  execute: async () => [
                    {
                      quantity_accepted: 100,
                      unit_price: 15000,
                      tax_rate_percent: 13.8,
                    },
                  ],
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const service = new ProcurementApplicationService(mockDb);
    const audit = await service.auditThreeWayMatching('vendor-sunvolt-01', 'po-001', 1707000);

    assert.ok(audit);
    assert.strictEqual(audit.isMatched, true);
    assert.strictEqual(audit.status, 'verified_match');
    assert.strictEqual(audit.varianceAmount, 0);
  });

  await t.test('Scenario 5: 3-Way Matching audit flags discrepancy when invoice exceeds received material', async () => {
    const poRecord = {
      id: 'po-001',
      po_number: 'PO-2026-1001',
      total_amount: 1707000,
    };

    // Received only 80 units: 80 * 15000 * 1.138 = 1,365,600
    // But invoice billed full 1,707,000 -> Significant discrepancy!
    const mockDb: any = {
      selectFrom: (table: string) => ({
        selectAll: () => ({
          where: () => ({
            where: () => ({
              executeTakeFirst: async () => (table === 'purchase_orders' ? poRecord : null),
            }),
          }),
        }),
        innerJoin: () => ({
          innerJoin: () => ({
            select: () => ({
              where: () => ({
                where: () => ({
                  execute: async () => [
                    {
                      quantity_accepted: 80,
                      unit_price: 15000,
                      tax_rate_percent: 13.8,
                    },
                  ],
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const service = new ProcurementApplicationService(mockDb);
    const audit = await service.auditThreeWayMatching('vendor-sunvolt-01', 'po-001', 1707000);

    assert.ok(audit);
    assert.strictEqual(audit.isMatched, false);
    assert.strictEqual(audit.status, 'discrepancy_flagged');
    assert.ok(audit.percentageVariance > 1.0);
  });
});
