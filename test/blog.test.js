import assert from 'node:assert/strict';
import test from 'node:test';

process.env.CREEM_WEBHOOK_SECRET ||= 'test_secret';

const { slugify } = await import('../src/blog.js');

test('creates URL-safe blog slugs', () => {
  assert.equal(slugify(' My First Blog Post! '), 'my-first-blog-post');
  assert.equal(slugify('A/B test: pricing & onboarding'), 'a-b-test-pricing-onboarding');
});

test('limits blog slugs', () => {
  assert.equal(slugify('x'.repeat(120)).length, 96);
});
