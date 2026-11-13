// ==============================================================================
// AETHRA Customer Service — Domain & Isolation Unit Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import { CustomerApplicationService } from '../application/customer.service.js';

test('Customer Service — Vendor-Independent Accounts & Multi-Property Registry', async (t) => {
  await t.test('Scenario 1: Creates customer account, profile, and queues customer.created.v1 outbox event', async () => {
    const insertedRecords: Record<string, any[]> = {
      customer_accounts: [],
      customer_profiles: [],
      customer_contacts: [],
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

    const service = new CustomerApplicationService(mockDb);
    const result = await service.createCustomer({
      accountType: 'individual',
      legalName: 'Aditi Rao',
      displayName: 'Aditi Rao',
      primaryEmail: 'aditi.rao@gmail.com',
      primaryPhone: '+919876543210',
      panTaxId: 'ABCDE1234F',
      correlationId: 'corr-cust-001',
    });

    assert.ok(result);
    assert.strictEqual(result.account.legal_name, 'Aditi Rao');
    assert.strictEqual(result.profile.primary_email, 'aditi.rao@gmail.com');

    // Verify Outbox Event
    assert.strictEqual(insertedRecords.outbox_events.length, 1);
    const outbox = insertedRecords.outbox_events[0];
    assert.strictEqual(outbox.event_type, 'customer.created.v1');
    assert.strictEqual(outbox.correlation_id, 'corr-cust-001');
    assert.strictEqual(outbox.payload.data.primaryEmail, 'aditi.rao@gmail.com');
  });

  await t.test('Scenario 2: Registers property with DISCOM consumer number & sanctioned load', async () => {
    let insertedProperty: any = null;
    const mockDb: any = {
      insertInto: (table: string) => {
        assert.strictEqual(table, 'customer_properties');
        return {
          values: (vals: any) => {
            insertedProperty = vals;
            return {
              returningAll: () => ({
                executeTakeFirstOrThrow: async () => vals,
              }),
            };
          },
        };
      },
    };

    const service = new CustomerApplicationService(mockDb);
    const property = await service.addProperty({
      customerId: 'cust-123',
      property: {
        propertyName: 'Greenwood Villa #4',
        propertyType: 'residential',
        addressLine1: '42 Orchid Road, Whitefield',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560066',
        discomName: 'BESCOM',
        consumerNumber: 'BESCOM-99281726',
        sanctionedLoadKw: 10.5,
        tariffRate: 7.25,
      },
    });

    assert.ok(property);
    assert.strictEqual(insertedProperty.customer_id, 'cust-123');
    assert.strictEqual(insertedProperty.discom_name, 'BESCOM');
    assert.strictEqual(insertedProperty.consumer_number, 'BESCOM-99281726');
    assert.strictEqual(insertedProperty.sanctioned_load_kw, 10.5);
  });

  await t.test('Scenario 3: Adds property installation with solar capacity and grid type', async () => {
    let insertedInstallation: any = null;
    const mockDb: any = {
      insertInto: (table: string) => {
        assert.strictEqual(table, 'property_installations');
        return {
          values: (vals: any) => {
            insertedInstallation = vals;
            return {
              returningAll: () => ({
                executeTakeFirstOrThrow: async () => vals,
              }),
            };
          },
        };
      },
    };

    const service = new CustomerApplicationService(mockDb);
    const installation = await service.addInstallation({
      propertyId: 'prop-999',
      installation: {
        installationName: 'Main Roof Solar PV 8kWp',
        systemType: 'solar_rooftop',
        gridType: 'on_grid',
        capacityKw: 8.0,
      },
    });

    assert.ok(installation);
    assert.strictEqual(insertedInstallation.property_id, 'prop-999');
    assert.strictEqual(insertedInstallation.system_type, 'solar_rooftop');
    assert.strictEqual(insertedInstallation.capacity_kw, 8.0);
    assert.strictEqual(insertedInstallation.status, 'planned');
  });

  await t.test('Scenario 4: Links portal user to customer account with role', async () => {
    let linkedUser: any = null;
    const mockDb: any = {
      insertInto: (table: string) => {
        assert.strictEqual(table, 'customer_users');
        return {
          values: (vals: any) => {
            linkedUser = vals;
            return {
              onConflict: () => ({
                returningAll: () => ({
                  executeTakeFirstOrThrow: async () => vals,
                }),
              }),
            };
          },
        };
      },
    };

    const service = new CustomerApplicationService(mockDb);
    const link = await service.linkCustomerUser({
      customerId: 'cust-123',
      userId: 'usr-identity-777',
      customerRole: 'owner',
    });

    assert.ok(link);
    assert.strictEqual(linkedUser.customer_id, 'cust-123');
    assert.strictEqual(linkedUser.user_id, 'usr-identity-777');
    assert.strictEqual(linkedUser.customer_role, 'owner');
  });
});
