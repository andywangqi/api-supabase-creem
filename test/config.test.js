import assert from 'node:assert/strict';
import test from 'node:test';

test('loads missing env values from .env.example', async () => {
  const previousAdminKey = process.env.ADMIN_API_KEY;
  delete process.env.ADMIN_API_KEY;

  try {
    const { config } = await import(`../src/config.js?fallback=${Date.now()}`);
    assert.equal(config.adminApiKey, '123456');
  } finally {
    if (previousAdminKey == null) {
      delete process.env.ADMIN_API_KEY;
    } else {
      process.env.ADMIN_API_KEY = previousAdminKey;
    }
  }
});
