import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('rewrites API paths through the route function', () => {
  assert.deepEqual(
    config.rewrites.find((rewrite) => rewrite.source === '/api/:path*'),
    {
      source: '/api/:path*',
      destination: '/api/route?path=:path*'
    }
  );
});

test('rewrites public app paths directly through the route function', () => {
  const rewrites = new Map(config.rewrites.map((rewrite) => [rewrite.source, rewrite.destination]));

  assert.equal(rewrites.get('/'), '/api/route?path=admin-page');
  assert.equal(rewrites.get('/admin'), '/api/route?path=admin-page');
  assert.equal(rewrites.get('/admin.html'), '/api/route?path=admin-page');
  assert.equal(rewrites.get('/admin/login'), '/api/route?path=admin-login-page');
  assert.equal(rewrites.get('/admin/login.html'), '/api/route?path=admin-login-page');
  assert.equal(rewrites.get('/health'), '/api/route?path=health');
});
