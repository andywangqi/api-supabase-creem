import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(new URL('../sql/schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../sql/rls-policies.sql', import.meta.url), 'utf8');

const tables = [
  'app_users',
  'payments',
  'blog_posts',
  'credit_transactions',
  'face_reports',
  'usage_limits',
  'user_entitlements',
  'user_subscriptions',
  'ai_generations'
];

test('schema defines backend RLS policies for all app tables', () => {
  for (const table of tables) {
    assert.match(schema, new RegExp(`create policy ${table}_backend_all[\\s\\S]+on public\\.${table}[\\s\\S]+to anon, authenticated`));
  }
});

test('standalone RLS policy migration covers all app tables', () => {
  for (const table of tables) {
    assert.match(migration, new RegExp(`create policy ${table}_backend_all[\\s\\S]+on public\\.${table}[\\s\\S]+with check \\(true\\);`));
  }
});
