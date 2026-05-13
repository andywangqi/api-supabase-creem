import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('does not rewrite API paths away from filesystem functions', () => {
  assert.equal(config.rewrites.some((rewrite) => rewrite.source === '/api/:path*'), false);
});
