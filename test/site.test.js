import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from '../src/config.js';

const {
  clientLocationFromRequest,
  normalizeAnonymousId,
  normalizeClientIp,
  normalizeCountry,
  parseCookies,
  serializeAnonymousCookie,
  toPublicUser
} = await import('../src/site.js');

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
