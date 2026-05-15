import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from '../src/config.js';

const {
  clientLocationFromRequest,
  getOrCreateSiteSession,
  normalizeAnonymousId,
  normalizeClientIp,
  normalizeCountry,
  parseCookies,
  serializeAnonymousCookie,
  toPublicUser
} = await import('../src/site.js');
const { saveSupabaseAuthUser } = await import('../src/auth-supabase.js');

test('parses cookies', () => {
  assert.deepEqual(parseCookies('anon_user_id=abc12345; theme=dark'), {
    anon_user_id: 'abc12345',
    theme: 'dark'
  });
});

test('normalizes anonymous ids', () => {
  assert.equal(normalizeAnonymousId('user_12345678'), 'user_12345678');
  assert.equal(normalizeAnonymousId('../bad'), '');
});

test('normalizes client ip and country headers', () => {
  assert.equal(normalizeClientIp('203.0.113.10, 10.0.0.1'), '203.0.113.10');
  assert.equal(normalizeClientIp('for="[2001:db8::1]:443";proto=https'), '2001:db8::1');
  assert.equal(normalizeCountry('us'), 'US');
  assert.equal(normalizeCountry('XX'), '');
});

test('extracts client location from request headers', () => {
  const request = new Request('https://example.com/api/site/session', {
    headers: {
      'x-forwarded-for': '198.51.100.20, 10.0.0.1',
      'x-vercel-ip-country': 'ca'
    }
  });

  assert.deepEqual(clientLocationFromRequest(request), {
    last_ip: '198.51.100.20',
    last_country: 'CA'
  });
});

test('serializes anonymous cookie', () => {
  const cookie = serializeAnonymousCookie(new Request('https://example.com/api/site/session'), 'user_12345678');

  assert.match(cookie, /anon_user_id=user_12345678/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
});

test('anonymous cookie can be scoped to configured parent domain', () => {
  const previousDomain = config.cookieDomain;
  config.cookieDomain = '.faceshapedetector.store';

  try {
    const cookie = serializeAnonymousCookie(new Request('https://admin.faceshapedetector.store/api/site/session'), 'user_12345678');
    assert.match(cookie, /Domain=.faceshapedetector.store/);
  } finally {
    config.cookieDomain = previousDomain;
  }
});

test('maps public user shape', () => {
  assert.deepEqual(toPublicUser({
    id: 'u1',
    external_id: 'ext1',
    anonymous_id: 'anon1',
    email: null,
    name: null,
    is_anonymous: true,
    created_at: '2026-05-08T00:00:00Z',
    last_seen_at: '2026-05-08T01:00:00Z'
  }), {
    id: 'u1',
    externalId: 'ext1',
    anonymousId: 'anon1',
    email: null,
    name: null,
    isAnonymous: true,
    creditsBalance: 0,
    createdAt: '2026-05-08T00:00:00Z',
    lastSeenAt: '2026-05-08T01:00:00Z'
  });
});

test('creates current anonymous user with the generated uuid as primary id', async () => {
  const uuid = '11111111-1111-4111-8111-111111111111';
  const calls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    const call = {
      url: String(url),
      method: options.method || 'GET',
      body: options.body ? JSON.parse(options.body) : null
    };
    calls.push(call);

    if (call.url.includes('/app_users?anonymous_id=eq.')) {
      return Response.json([]);
    }

    if (call.url.includes('/app_users?on_conflict=anonymous_id')) {
      return Response.json([{
        ...call.body,
        credits_balance: 0,
        created_at: '2026-05-15T00:00:00.000Z',
        last_seen_at: '2026-05-15T00:00:00.000Z'
      }]);
    }

    throw new Error(`Unexpected fetch: ${call.method} ${call.url}`);
  };

  try {
    const session = await getOrCreateSiteSession(
      new Request('https://example.com/api/site/session'),
      { anonymousId: uuid }
    );
    const insert = calls.find((call) => call.url.includes('/app_users?on_conflict=anonymous_id'));

    assert.equal(insert.body.id, uuid);
    assert.equal(insert.body.anonymous_id, uuid);
    assert.equal(session.body.user.id, uuid);
    assert.equal(session.body.anonymousId, uuid);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('supabase login merges existing login row into current uuid user', async () => {
  const currentId = '22222222-2222-4222-8222-222222222222';
  const oldLoginId = '33333333-3333-4333-8333-333333333333';
  const calls = [];
  const originalFetch = globalThis.fetch;
  const previousJwtSecret = config.supabaseJwtSecret;
  config.supabaseJwtSecret = '';

  const currentUser = {
    id: currentId,
    anonymous_id: currentId,
    is_anonymous: true,
    metadata: { source: 'anonymous_session' },
    credits_balance: 0,
    created_at: '2026-05-15T00:00:00.000Z',
    last_seen_at: '2026-05-15T00:00:00.000Z'
  };
  const oldLoginUser = {
    id: oldLoginId,
    email: 'user@example.com',
    auth_provider_user_id: 'supabase-user-1',
    is_anonymous: false,
    metadata: { source: 'supabase_google' },
    credits_balance: 10,
    created_at: '2026-05-14T00:00:00.000Z',
    last_seen_at: '2026-05-15T01:00:00.000Z'
  };

  globalThis.fetch = async (url, options = {}) => {
    const call = {
      url: String(url),
      method: options.method || 'GET',
      body: options.body ? JSON.parse(options.body) : null
    };
    calls.push(call);

    if (call.url.includes('/app_users?anonymous_id=eq.')) return Response.json([currentUser]);
    if (call.url.includes('/app_users?auth_provider_user_id=eq.')) return Response.json([oldLoginUser]);
    if (call.url.includes('/app_users?email=eq.')) return Response.json([oldLoginUser]);
    if (call.url.includes('/rpc/merge_app_users')) return Response.json([{ ...currentUser, credits_balance: 10 }]);
    if (call.url.includes(`/app_users?id=eq.${encodeURIComponent(currentId)}`) && call.method === 'PATCH') {
      return Response.json([{ ...currentUser, ...call.body, credits_balance: 10 }]);
    }

    throw new Error(`Unexpected fetch: ${call.method} ${call.url}`);
  };

  try {
    const user = await saveSupabaseAuthUser(
      new Request('https://example.com/api/auth/supabase', {
        method: 'POST',
        headers: {
          cookie: `${config.anonCookieName}=${currentId}`
        }
      }),
      {
        id: 'supabase-user-1',
        email: 'user@example.com',
        name: 'User Name'
      }
    );
    const merge = calls.find((call) => call.url.includes('/rpc/merge_app_users'));
    const patch = calls.find((call) => call.url.includes(`/app_users?id=eq.${encodeURIComponent(currentId)}`));

    assert.deepEqual(merge.body, {
      p_target_user_id: currentId,
      p_source_user_id: oldLoginId
    });
    assert.equal(patch.body.email, 'user@example.com');
    assert.equal(patch.body.auth_provider_user_id, 'supabase-user-1');
    assert.equal(user.id, currentId);
    assert.equal(user.is_anonymous, false);
  } finally {
    config.supabaseJwtSecret = previousJwtSecret;
    globalThis.fetch = originalFetch;
  }
});
