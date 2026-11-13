// ==============================================================================
// AETHRA Quotation Service — Immutability & Lifecycle Unit Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { QuotationApplicationService } from '../application/quotation.service.js';

test('Quotation Service — Pricing, Revision Lifecycle & Immutability Rules', async (t) => {
  await t.test('Scenario 1: Creates quotation with initial Revision 1 (draft) and computes line taxes', async () => {
    const insertedRecords: Record<string, any[]> = {
      quotations: [],
      quotation_revisions: [],
      quotation_lines: [],
      outbox_events: [],
    };

    const mockDb: any = {
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                insertedRecords[table].push(vals);
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

    const service = new QuotationApplicationService(mockDb);
    const result = await service.createQuotation({
      organisationId: 'vendor-sunvolt-01',
      customerId: 'cust-sharma-99',
      title: '5kW Residential Solar Rooftop Installation',
      createdByUserId: 'usr-sales-01',
      correlationId: 'corr-quot-101',
      lines: [
        {
          itemType: 'product',
          itemDescription: 'Mono PERC Solar PV Panels 550W (10 Nos)',
          quantity: 10,
          unit: 'NOS',
          unitPrice: 18000,
          taxRatePercent: 13.8, // Solar GST composite rate
        },
        {
          itemType: 'service',
          itemDescription: 'Complete Installation, Testing & Net-Metering Liaison',
          quantity: 1,
          unit: 'SET',
          unitPrice: 45000,
          taxRatePercent: 18.0,
        },
      ],
    });

    assert.ok(result);
    assert.strictEqual(result.quotation.status, 'draft');
    assert.strictEqual(result.revision.revision_number, 1);
    assert.strictEqual(result.revision.status, 'draft');

    // 10 * 18000 = 180,000; Tax @ 13.8% = 24,840
    // 1 * 45000 = 45,000; Tax @ 18% = 8,100
    // Subtotal = 225,000; Total Tax = 32,940; Total Payable = 257,940
    assert.strictEqual(result.revision.subtotal_amount, 225000);
    assert.strictEqual(result.revision.total_tax_amount, 32940);
    assert.strictEqual(result.revision.total_payable_amount, 257940);
    assert.strictEqual(result.lines.length, 2);
  });

  await t.test('Scenario 2: Issue quotation revision freezes revision and dispatches quotation.issued.v1 event', async () => {
    const revisionRecord: any = {
      id: 'rev-001',
      quotation_id: 'quot-001',
      organisation_id: 'vendor-sunvolt-01',
      revision_number: 1,
      status: 'draft',
      total_payable_amount: 257940,
      valid_until: new Date('2026-12-01T00:00:00Z'),
    };

    const quotationRecord: any = {
      id: 'quot-001',
      quotation_number: 'QT-2026-1001',
      customer_id: 'cust-sharma-99',
      organisation_id: 'vendor-sunvolt-01',
      status: 'draft',
    };

    const insertedEvents: any[] = [];

    const mockDb: any = {
      selectFrom: (table: string) => ({
        selectAll: () => ({
          where: (_col: string, _op: string, _val: any) => ({
            where: () => ({
              where: () => ({
                executeTakeFirst: async () => (table === 'quotation_revisions' ? revisionRecord : quotationRecord),
              }),
              executeTakeFirstOrThrow: async () => quotationRecord,
            }),
            executeTakeFirstOrThrow: async () => (table === 'quotations' ? quotationRecord : revisionRecord),
          }),
        }),
      }),
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            updateTable: (_table: string) => ({
              set: (updates: any) => ({
                where: () => ({
                  returningAll: () => ({
                    executeTakeFirstOrThrow: async () => ({ ...revisionRecord, ...updates }),
                  }),
                  execute: async () => {},
                }),
              }),
            }),
            insertInto: (_table: string) => ({
              values: (vals: any) => {
                insertedEvents.push(vals);
                return { execute: async () => {} };
              },
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new QuotationApplicationService(mockDb);
    const issued = await service.issueQuotationRevision({
      organisationId: 'vendor-sunvolt-01',
      quotationId: 'quot-001',
      revisionId: 'rev-001',
      correlationId: 'corr-issue-101',
    });

    assert.strictEqual(issued.status, 'issued');
    assert.ok(issued.issued_at);
    assert.strictEqual(insertedEvents.length, 1);
    assert.strictEqual(insertedEvents[0].event_type, 'quotation.issued.v1');
    assert.strictEqual(insertedEvents[0].payload.data.quotationNumber, 'QT-2026-1001');
    assert.strictEqual(insertedEvents[0].payload.data.totalPayableAmount, 257940);
  });

  await t.test('Scenario 3: Immutability check prevents updating issued revisions (Scenario 8)', async () => {
    const service = new QuotationApplicationService({} as any);

    assert.throws(
      () => service.assertRevisionEditable('issued'),
      /CANNOT_MODIFY_FROZEN_REVISION/,
      'Must reject edits on issued revisions'
    );

    assert.throws(
      () => service.assertRevisionEditable('accepted'),
      /CANNOT_MODIFY_FROZEN_REVISION/,
      'Must reject edits on accepted revisions'
    );

    // Draft revision is editable
    assert.doesNotThrow(() => service.assertRevisionEditable('draft'));
  });

  await t.test('Scenario 4: Customer acceptance freezes quotation and emits quotation.accepted.v1 saga event', async () => {
    const revisionRecord: any = {
      id: 'rev-001',
      quotation_id: 'quot-001',
      organisation_id: 'vendor-sunvolt-01',
      revision_number: 1,
      status: 'issued', // must be issued to be accepted
      total_payable_amount: 257940,
    };

    const quotationRecord: any = {
      id: 'quot-001',
      quotation_number: 'QT-2026-1001',
      customer_id: 'cust-sharma-99',
      organisation_id: 'vendor-sunvolt-01',
      status: 'issued',
    };

    const outboxEvents: any[] = [];
    const responses: any[] = [];

    const mockDb: any = {
      selectFrom: (table: string) => ({
        selectAll: () => ({
          where: (_col: string, _op: string, _val: any) => ({
            where: () => ({
              where: () => ({
                executeTakeFirst: async () => (table === 'quotation_revisions' ? revisionRecord : quotationRecord),
              }),
            }),
            executeTakeFirstOrThrow: async () => (table === 'quotations' ? quotationRecord : revisionRecord),
          }),
        }),
      }),
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                if (table === 'customer_responses') responses.push(vals);
                if (table === 'outbox_events') outboxEvents.push(vals);
                return { execute: async () => {} };
              },
            }),
            updateTable: (_table: string) => ({
              set: () => ({
                where: () => ({
                  execute: async () => {},
                }),
              }),
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new QuotationApplicationService(mockDb);
    await service.acceptQuotation({
      organisationId: 'vendor-sunvolt-01',
      quotationId: 'quot-001',
      revisionId: 'rev-001',
      customerUserId: 'cust-usr-rajesh',
      signatureType: 'otp_verified',
      signatureToken: 'sig-token-sha256-verified',
      ipAddress: '103.21.144.1',
      userAgent: 'Mozilla/5.0 Android App',
      correlationId: 'corr-accept-999',
    });

    assert.strictEqual(responses.length, 1);
    assert.strictEqual(responses[0].decision, 'accept');
    assert.strictEqual(responses[0].signature_type, 'otp_verified');

    assert.strictEqual(outboxEvents.length, 1);
    const event = outboxEvents[0];
    assert.strictEqual(event.event_type, 'quotation.accepted.v1');
    assert.strictEqual(event.payload.data.quotationId, 'quot-001');
    assert.strictEqual(event.payload.data.acceptedByUserId, 'cust-usr-rajesh');
    assert.strictEqual(event.payload.data.totalPayableAmount, 257940);
  });

  await t.test('Scenario 5: Creating Revision n+1 increments revision number preserving previous revision', async () => {
    const existingQuotation: any = {
      id: 'quot-001',
      organisation_id: 'vendor-sunvolt-01',
      status: 'issued', // previous revision is issued
    };

    const latestRevision: any = {
      id: 'rev-001',
      revision_number: 1,
      status: 'issued',
    };

    const createdRevisions: any[] = [];

    const mockDb: any = {
      selectFrom: (_table: string) => ({
        selectAll: () => ({
          where: () => ({
            where: () => ({
              executeTakeFirst: async () => existingQuotation,
            }),
            orderBy: () => ({
              executeTakeFirst: async () => latestRevision,
            }),
          }),
        }),
      }),
      transaction: () => ({
        execute: async (fn: any) => {
          const trxMock = {
            insertInto: (table: string) => ({
              values: (vals: any) => {
                if (table === 'quotation_revisions') createdRevisions.push(vals);
                return {
                  returningAll: () => ({
                    executeTakeFirstOrThrow: async () => vals,
                  }),
                  execute: async () => {},
                };
              },
            }),
            updateTable: () => ({
              set: () => ({
                where: () => ({
                  execute: async () => {},
                }),
              }),
            }),
          };
          return fn(trxMock);
        },
      }),
    };

    const service = new QuotationApplicationService(mockDb);
    const result = await service.createQuotationRevision({
      organisationId: 'vendor-sunvolt-01',
      quotationId: 'quot-001',
      createdByUserId: 'usr-sales-01',
      correlationId: 'corr-rev2',
      lines: [
        {
          itemType: 'product',
          itemDescription: 'Higher efficiency 580W TOPCon Panels',
          quantity: 10,
          unit: 'NOS',
          unitPrice: 20000,
          taxRatePercent: 13.8,
        },
      ],
    });

    assert.strictEqual(result.revision.revision_number, 2);
    assert.strictEqual(result.revision.status, 'draft');
    assert.strictEqual(createdRevisions.length, 1);
    assert.strictEqual(createdRevisions[0].revision_number, 2);
  });
});
