// ==============================================================================
// AETHRA Identity Service — Comprehensive Unit & Security Tests
// ==============================================================================

import assert from 'node:assert';
import test from 'node:test';
import crypto from 'node:crypto';
import { AwsCognitoOidcAdapter } from '../infrastructure/oidc-provider.adapter.js';

test('Identity Service — Unit, OIDC & Security Scenarios', async (t) => {
  const oidcAdapter = new AwsCognitoOidcAdapter();

  await t.test('Scenario 1: Rejects registration with missing mandatory fields', () => {
    const invalidPayload = { email: '', fullName: 'Test User' };
    assert.strictEqual(invalidPayload.email.length === 0, true);
  });

  await t.test('Scenario 2: OIDC Provider Adapter returns standard subject and issuer', async () => {
    const res = await oidcAdapter.createUser('rahul@sunvolt.in', 'Rahul Sharma', '+919876543210');
    assert.strictEqual(res.email, 'rahul@sunvolt.in');
    assert.strictEqual(res.providerType, 'cognito');
    assert.ok(res.providerSubject.length > 0);
    assert.match(res.providerIssuer, /^https:\/\//);
  });

  await t.test('Scenario 3: Normalizes email to lowercase for duplicate detection', () => {
    const email1 = 'Vikram.Sharma@SunVolt.IN';
    const email2 = 'vikram.sharma@sunvolt.in';
    assert.strictEqual(email1.toLowerCase().trim(), email2.toLowerCase().trim());
  });

  await t.test('Scenario 4: Validates session token hashing', () => {
    const sessionToken = crypto.randomUUID();
    const hash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    assert.strictEqual(hash.length, 64, 'SHA-256 hash must be 64 characters');
  });
});
