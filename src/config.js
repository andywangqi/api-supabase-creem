import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

function boolEnv(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export const config = {
  port: Number(process.env.PORT || 3000),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  timezoneOffsetMinutes: Number(process.env.APP_TIMEZONE_OFFSET_MINUTES || 480),
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD',
  anonCookieName: process.env.APP_ANON_COOKIE_NAME || 'anon_user_id',
  cookieDomain: process.env.APP_COOKIE_DOMAIN || '',
  adminApiKey: process.env.ADMIN_API_KEY || '',
  supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseSchema: process.env.SUPABASE_SCHEMA || 'public',
  creemApiKey: process.env.CREEM_API_KEY || '',
  creemWebhookSecret: process.env.CREEM_WEBHOOK_SECRET || '',
  creemProductId: process.env.CREEM_PRODUCT_ID || '',
  creemTestMode: boolEnv(process.env.CREEM_TEST_MODE, true)
};

export function missing(keys) {
  return keys.filter((key) => !config[key]);
}

export function creemBaseUrl() {
  return config.creemTestMode ? 'https://test-api.creem.io' : 'https://api.creem.io';
}
