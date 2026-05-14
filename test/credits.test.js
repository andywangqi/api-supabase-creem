import assert from 'node:assert/strict';
import test from 'node:test';

process.env.CREEM_WEBHOOK_SECRET ||= 'test_secret';

const { normalizeCreditAmount, toPublicUserCredit } = await import('../src/credits.js');

test('normalizes positive credit amounts', () => {
  assert.equal(normalizeCreditAmount(10), 10);
  assert.equal(normalizeCreditAmount('25'), 25);
});

test('rejects invalid credit amounts', () => {
  assert.throws(() => normalizeCreditAmount(0), /positive integer/);
  assert.throws(() => normalizeCreditAmount(-1), /positive integer/);
  assert.throws(() => normalizeCreditAmount(1.5), /positive integer/);
});

test('maps public user credit shape', () => {
  assert.deepEqual(toPublicUserCredit({
    id: 'u1',
    email: 'a@example.com',
    anonymous_id: 'anon1',
    name: 'A',
    is_anonymous: false,
    credits_balance: 88,
    created_at: '2026-05-10T00:00:00Z',
    last_seen_at: '2026-05-10T01:00:00Z'
  }), {
    userId: 'u1',
    email: 'a@example.com',
    anonymousId: 'anon1',
    name: 'A',
    displayName: 'A',
    isAnonymous: false,
    creditsBalance: 88,
    createdAt: '2026-05-10T00:00:00Z',
    lastSeenAt: '2026-05-10T01:00:00Z'
  });
});

test('uses anonymous id as admin display name for anonymous users', () => {
  assert.equal(toPublicUserCredit({
    id: 'u2',
    anonymous_id: 'anon_12345678',
    is_anonymous: true,
    credits_balance: 0
  }).displayName, 'anon_12345678');
});

test('uses nickname as admin display name for registered users', () => {
  assert.equal(toPublicUserCredit({
    id: 'u3',
    email: 'user@example.com',
    anonymous_id: 'anon_12345678',
    name: 'Real Nickname',
    is_anonymous: false,
    credits_balance: 0
  }).displayName, 'Real Nickname');
});
