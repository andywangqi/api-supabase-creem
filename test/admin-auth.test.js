import assert from 'node:assert/strict';
import test from 'node:test';

process.env.ADMIN_API_KEY ||= 'test_admin_key';
process.env.CREEM_WEBHOOK_SECRET ||= 'test_secret';

const {
  adminSessionCookieName,
  createAdminSessionToken,
  hasAdminSession,
  isAdminKeyValid,
  serializeAdminLogoutCookie,
  serializeAdminSessionCookie,
  verifyAdminSessionToken
} = await import('../src/auth.js');
const { default: app } = await import('../api/[...path].js');
const { default: adminLoginApp } = await import('../api/admin/login.js');

test('validates admin keys', () => {
  assert.equal(isAdminKeyValid('test_admin_key'), true);
  assert.equal(isAdminKeyValid('wrong'), false);
});

test('creates and verifies admin session tokens', () => {
  const now = 1760000000000;
  const token = createAdminSessionToken(now);

  assert.equal(verifyAdminSessionToken(token, now + 1000), true);
  assert.equal(verifyAdminSessionToken(token, now + 8 * 24 * 60 * 60 * 1000), false);
  assert.equal(verifyAdminSessionToken(`${now}.bad`, now + 1000), false);
});

test('reads admin session from cookie', () => {
  const now = Date.now();
  const token = createAdminSessionToken(now);
  const request = new Request('https://example.com/admin', {
    headers: {
      cookie: `${adminSessionCookieName()}=${encodeURIComponent(token)}`
    }
  });

  assert.equal(hasAdminSession(request), true);
});

test('serializes admin login and logout cookies', () => {
  const request = new Request('https://example.com/admin/login');
  const loginCookie = serializeAdminSessionCookie(request, 1760000000000);
  const logoutCookie = serializeAdminLogoutCookie(request);

  assert.match(loginCookie, /admin_session=/);
  assert.match(loginCookie, /HttpOnly/);
  assert.match(loginCookie, /Secure/);
  assert.match(logoutCookie, /Max-Age=0/);
});

test('requires login for admin page', async () => {
  const response = await app.fetch(new Request('https://example.com/admin'));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/login');
});

test('allows admin page after login', async () => {
  const login = await app.fetch(new Request('https://example.com/api/admin/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ adminKey: 'test_admin_key' })
  }));
  const cookie = login.headers.get('set-cookie');

  assert.equal(login.status, 200);
  assert.ok(cookie);

  const response = await app.fetch(new Request('https://example.com/admin', {
    headers: {
      cookie
    }
  }));

  assert.equal(response.status, 200);
});

test('allows admin login through rewritten route entry', async () => {
  const response = await app.fetch(new Request('https://example.com/api/route?path=admin/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ adminKey: 'test_admin_key' })
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('allows admin login through explicit Vercel function entry', async () => {
  const response = await adminLoginApp.fetch(new Request('https://example.com/api/admin/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ adminKey: 'test_admin_key' })
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('reports admin session state', async () => {
  const anonymous = await app.fetch(new Request('https://example.com/api/admin/session'));
  assert.deepEqual(await anonymous.json(), { authenticated: false });

  const login = await app.fetch(new Request('https://example.com/api/admin/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ adminKey: 'test_admin_key' })
  }));
  const cookie = login.headers.get('set-cookie');
  const authenticated = await app.fetch(new Request('https://example.com/api/admin/session', {
    headers: {
      cookie
    }
  }));

  assert.deepEqual(await authenticated.json(), { authenticated: true });
});

test('blocks direct admin html access', async () => {
  const response = await app.fetch(new Request('https://example.com/admin.html'));
  assert.equal(response.status, 404);
});
