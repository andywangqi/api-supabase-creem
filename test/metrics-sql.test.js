import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(new URL('../sql/schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../sql/admin-metrics-identified-users.sql', import.meta.url), 'utf8');

test('admin user metrics exclude anonymous session users', () => {
  assert.match(schema, /count\(\*\) from public\.app_users where is_anonymous = false/);
  assert.match(schema, /where is_anonymous = false\s+and created_at >= p_day_start/);
  assert.match(migration, /count\(\*\) from public\.app_users where is_anonymous = false/);
  assert.match(migration, /where is_anonymous = false\s+and created_at >= p_day_start/);
});
