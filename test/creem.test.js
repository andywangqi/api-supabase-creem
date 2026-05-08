import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

process.env.CREEM_WEBHOOK_SECRET = 'test_secret';

const { mapCreemEvent, verifyCreemSignature } = await import('../src/creem.js');
const { localDayBounds } = await import('../src/time.js');

test('verifies Creem HMAC signature', () => {
  const rawBody = Buffer.from(JSON.stringify({ id: 'evt_1', eventType: 'checkout.completed' }));
  const signature = createHmac('sha256', 'test_secret').update(rawBody).digest('hex');

  assert.doesNotThrow(() => {
    verifyCreemSignature(rawBody, { 'creem-signature': signature });
  });
});

test('ignores subscription checkout completion to avoid double counting', () => {
  const mapped = mapCreemEvent({
    id: 'evt_checkout',
    eventType: 'checkout.completed',
    object: {
      subscription: { id: 'sub_1' },
      product: { price: 9900 }
    }
  });

  assert.equal(mapped.ignored, true);
});

test('maps subscription payment amount from product price', () => {
  const mapped = mapCreemEvent({
    id: 'evt_paid',
    eventType: 'subscription.paid',
    created_at: 1728734325927,
    object: {
      id: 'sub_1',
      customer: {
        id: 'cust_1',
        email: 'USER@EXAMPLE.COM'
      },
      product: {
        id: 'prod_1',
        name: 'Pro',
        price: 9900
      },
      metadata: {
        userId: '2cc5f6aa-c83c-4a70-8c86-a759ac3188fd'
      }
    }
  });

  assert.equal(mapped.ignored, false);
  assert.equal(mapped.payment.amount, 9900);
  assert.equal(mapped.payment.currency, 'USD');
  assert.equal(mapped.payment.email, 'user@example.com');
  assert.equal(mapped.payment.paid_at, '2024-10-12T11:58:45.927Z');
});

test('calculates local day bounds with UTC+8 offset', () => {
  const bounds = localDayBounds(new Date('2026-05-08T15:30:00.000Z'), 480);

  assert.equal(bounds.localDate, '2026-05-08');
  assert.equal(bounds.start, '2026-05-07T16:00:00.000Z');
  assert.equal(bounds.end, '2026-05-08T16:00:00.000Z');
});
