import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

process.env.CREEM_WEBHOOK_SECRET ||= 'test_secret';

const { createBlogPost, slugify, toBlogPostingSchema } = await import('../src/blog.js');

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

test('admin user list displays ip and country', () => {
  const html = readFileSync(new URL('../src/views/admin.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../public/admin.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../public/admin.css', import.meta.url), 'utf8');

  assert.match(html, /<th>IP<\/th>/);
  assert.match(html, /<th>Country<\/th>/);
  assert.match(script, /user\.lastIp/);
  assert.match(script, /function countryLabel/);
  assert.match(styles, /\.userTable/);
});

test('maps blog posts to BlogPosting schema', () => {
  assert.deepEqual(toBlogPostingSchema({
    title: 'Face Shape Guide',
    excerpt: 'Pick the right haircut.',
    cover_image_url: '/images/face-guide.jpg',
    author_name: 'Admin',
    published_at: '2026-05-15T01:00:00.000Z',
    updated_at: '2026-05-15T02:00:00.000Z',
    created_at: '2026-05-14T23:00:00.000Z'
  }), {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: 'Face Shape Guide',
    description: 'Pick the right haircut.',
    datePublished: '2026-05-15T01:00:00.000Z',
    dateModified: '2026-05-15T02:00:00.000Z',
    image: 'https://admin.faceshapedetector.store/images/face-guide.jpg',
    author: {
      '@type': 'Person',
      name: 'Admin'
    },
    publisher: {
      '@type': 'Organization',
      name: 'Face Shape Detector',
      url: 'https://admin.faceshapedetector.store'
    }
  });
});

test('creates a new blog instead of overwriting an existing slug', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    const call = {
      url: String(url),
      method: options.method || 'GET',
      body: options.body ? JSON.parse(options.body) : null
    };
    calls.push(call);

    if (call.url.includes('/blog_posts?slug=eq.duplicate&select=id,slug&limit=1')) {
      return Response.json([{ id: 'old-blog', slug: 'duplicate' }]);
    }

    if (call.url.includes('/blog_posts?slug=eq.duplicate-2&select=id,slug&limit=1')) {
      return Response.json([]);
    }

    if (call.url.endsWith('/blog_posts') && call.method === 'POST') {
      return Response.json([{
        id: 'new-blog',
        ...call.body,
        created_at: '2026-05-15T00:00:00.000Z',
        updated_at: '2026-05-15T00:00:00.000Z'
      }]);
    }

    throw new Error(`Unexpected fetch: ${call.method} ${call.url}`);
  };

  try {
    const blog = await createBlogPost({
      title: 'Duplicate',
      slug: 'duplicate',
      content: 'Second post',
      status: 'published'
    });

    const post = calls.find((call) => call.method === 'POST');
    assert.equal(blog.slug, 'duplicate-2');
    assert.equal(post.body.slug, 'duplicate-2');
    assert.ok(!post.url.includes('on_conflict=slug'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
