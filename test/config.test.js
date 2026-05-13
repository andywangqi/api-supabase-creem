import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('loads missing env values from .env.example', () => {
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    "delete process.env.ADMIN_API_KEY; const { config } = await import('./src/config.js'); console.log(config.adminApiKey);"
  ], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '123456');
});
