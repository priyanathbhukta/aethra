// ==============================================================================
// AETHRA Notification Service — Multi-Channel Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { NotificationApplicationService } from '../application/notification.service.js';

test('Notification Service — Multi-Channel Dispatch & Template Interpolation', async (t) => {
  await t.test('Scenario 1: Dispatches email notification with template interpolation', async () => {
    const template = {
      id: 'tmpl-001',
      template_code: 'quote_issued_v1',
      channel: 'email',
      body_template: 'Dear {{customerName}}, quotation {{quotationNumber}} for amount INR {{amount}} is ready.',
    };

    let createdDelivery: any = null;
    let attemptRecord: any = null;

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            where: () => ({
              executeTakeFirst: async () => template,
            }),
          }),
        }),
      }),
      insertInto: (table: string) => ({
        values: (vals: any) => {
          if (table === 'notification_deliveries') createdDelivery = vals;
          if (table === 'delivery_attempts') attemptRecord = vals;
          return {
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => vals,
            }),
            execute: async () => {},
          };
        },
      }),
      updateTable: () => ({
        set: (updates: any) => ({
          where: () => ({
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => ({ ...createdDelivery, ...updates }),
            }),
          }),
        }),
      }),
    };

    const service = new NotificationApplicationService(mockDb);
    const result = await service.sendNotification({
      organisationId: 'vendor-sunvolt-01',
      templateCode: 'quote_issued_v1',
      destination: 'rajesh.sharma@example.com',
      channel: 'email',
      templateData: {
        customerName: 'Rajesh Sharma',
        quotationNumber: 'QT-2026-1001',
        amount: '2,57,940',
      },
      correlationId: 'corr-notif-101',
    });

    assert.ok(result);
    assert.strictEqual(
      result.renderedBody,
      'Dear Rajesh Sharma, quotation QT-2026-1001 for amount INR 2,57,940 is ready.'
    );
    assert.strictEqual(result.delivery.status, 'sent');
    assert.ok(attemptRecord);
    assert.strictEqual(attemptRecord.provider_name, 'aws_ses');
    assert.strictEqual(attemptRecord.status, 'success');
  });

  await t.test('Scenario 2: Dispatches WhatsApp message with variables', async () => {
    const template = {
      id: 'tmpl-002',
      template_code: 'ticket_created_v1',
      channel: 'whatsapp',
      body_template: 'AETHRA Support: Ticket {{ticketNumber}} logged for issue {{ticketType}}.',
    };

    const mockDb: any = {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            where: () => ({
              executeTakeFirst: async () => template,
            }),
          }),
        }),
      }),
      insertInto: () => ({
        values: (vals: any) => ({
          returningAll: () => ({
            executeTakeFirstOrThrow: async () => vals,
          }),
          execute: async () => {},
        }),
      }),
      updateTable: () => ({
        set: (updates: any) => ({
          where: () => ({
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => updates,
            }),
          }),
        }),
      }),
    };

    const service = new NotificationApplicationService(mockDb);
    const result = await service.sendNotification({
      organisationId: 'vendor-sunvolt-01',
      templateCode: 'ticket_created_v1',
      destination: '+919876543210',
      channel: 'whatsapp',
      templateData: {
        ticketNumber: 'TKT-2026-0044',
        ticketType: 'Inverter Grid Tripping',
      },
      correlationId: 'corr-notif-102',
    });

    assert.ok(result);
    assert.strictEqual(
      result.renderedBody,
      'AETHRA Support: Ticket TKT-2026-0044 logged for issue Inverter Grid Tripping.'
    );
  });

  await t.test('Scenario 3: Creates in-app notification for portal user', async () => {
    let createdInApp: any = null;

    const mockDb: any = {
      insertInto: () => ({
        values: (vals: any) => {
          createdInApp = vals;
          return {
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => vals,
            }),
          };
        },
      }),
    };

    const service = new NotificationApplicationService(mockDb);
    const notif = await service.createInAppNotification({
      recipientUserId: 'usr-rajesh-99',
      organisationId: 'vendor-sunvolt-01',
      title: 'Solar Installation Completed',
      body: 'Your 5kW solar plant has been commissioned successfully.',
      linkAction: '/portal/projects/prj-001',
    });

    assert.ok(notif);
    assert.strictEqual(notif.title, 'Solar Installation Completed');
    assert.strictEqual(notif.is_read, false);
    assert.ok(createdInApp);
  });
});
