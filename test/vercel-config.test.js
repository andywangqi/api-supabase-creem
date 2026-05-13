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
