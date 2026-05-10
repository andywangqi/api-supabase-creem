import assert from 'node:assert/strict';
import test from 'node:test';

process.env.CREEM_WEBHOOK_SECRET ||= 'test_secret';

const { AI_CREDIT_COSTS, detectLimitForPlan, monthlyCreditsForPlan } = await import('../src/products.js');
const { toPublicReport } = await import('../src/reports.js');

test('returns face detection limits by plan', () => {
  assert.equal(detectLimitForPlan('free'), 3);
  assert.equal(detectLimitForPlan('full_report'), 3);
  assert.equal(detectLimitForPlan('pro_monthly'), 50);
  assert.equal(detectLimitForPlan('studio_monthly'), 200);
});

test('returns monthly subscription credits', () => {
  assert.equal(monthlyCreditsForPlan('pro_monthly'), 150);
  assert.equal(monthlyCreditsForPlan('studio_monthly'), 500);
  assert.equal(monthlyCreditsForPlan('credits_50'), 0);
});

test('defines AI generation credit costs', () => {
  assert.deepEqual(AI_CREDIT_COSTS, {
    makeup: 8,
    hairstyle: 10,
    hd: 20
  });
});

test('hides full report unless unlocked', () => {
  const row = {
    id: 'r1',
    user_id: 'u1',
    anonymous_id: 'a1',
    face_shape: 'oblong',
    confidence: 0.5,
    scores: { oblong: 0.5 },
    characteristics: {},
    free_result: { summary: 'free' },
    full_result: { details: 'full' },
    image_url: null,
    created_at: '2026-05-10T00:00:00Z'
  };

  assert.equal(toPublicReport(row).fullResult, null);
  assert.deepEqual(toPublicReport(row, { unlocked: true, source: 'entitlement' }).fullResult, { details: 'full' });
});
