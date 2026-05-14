import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('admin blog editor supports inserting content image URLs', () => {
  const html = readFileSync(new URL('../src/views/admin.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../public/admin.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../public/admin.css', import.meta.url), 'utf8');

  assert.match(html, /id="blogImageUrl"/);
  assert.match(html, /id="blogImageAlt"/);
  assert.match(html, /id="insertBlogImage"/);
  assert.match(script, /function formatBlogImageMarkdown/);
  assert.match(script, /insertBlogImageButton\.addEventListener\('click', insertBlogImage\)/);
  assert.match(styles, /\.blogImageTools/);
});
