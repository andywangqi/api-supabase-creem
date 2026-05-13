import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('documents admin login as POST api and GET page route', () => {
  const docs = `${read('ADMIN_API.md')}\n${read('README.md')}`;

  assert.match(docs, /GET`? \| `\/admin\/login`|`GET \/admin\/login`/);
  assert.match(docs, /POST`? \| `\/api\/admin\/login`|`POST \/api\/admin\/login`/);
  assert.doesNotMatch(docs, /GET\s+\/api\/admin\/login/);
});

test('documents frontend api methods used by app router', () => {
  const docs = read('FRONTEND_API.md');
  const endpoints = [
    'GET /health',
    'GET /api/health',
    'GET /api/site/session',
    'POST /api/site/session',
    'POST /api/auth/supabase',
    'GET /api/site/credits',
    'POST /api/site/credits/deduct',
    'POST /api/face/detect/allow',
    'POST /api/face/reports',
    'GET /api/face/reports/:id',
    'GET /api/site/access',
    'POST /api/site/checkout',
    'POST /api/ai/try-on',
    'GET /api/blogs',
    'GET /api/blogs/:slug'
  ];

  for (const endpoint of endpoints) {
    const [method, path] = endpoint.split(' ');
    assert.match(docs, new RegExp(`${method}.*${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }
});
