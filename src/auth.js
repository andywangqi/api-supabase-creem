import { createHmac, timingSafeEqual } from 'node:crypto';
import { config, missing } from './config.js';
import { AppError } from './supabase.js';

const ADMIN_SESSION_COOKIE = 'admin_session';
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function headerValue(headers, name) {
  if (typeof headers?.get === 'function') {
    return headers.get(name) || '';
  }
  return headers?.[name] || headers?.[name.toLowerCase()] || '';
}

export function requireAdmin(req) {
  const miss = missing(['adminApiKey']);
  if (miss.length) {
    throw new AppError('Missing ADMIN_API_KEY', 500);
  }

  const headers = req.headers || req;
  const authorization = headerValue(headers, 'authorization');
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const provided = headerValue(headers, 'x-admin-key') || bearer;

  if (provided && provided === config.adminApiKey) {
    return true;
  }

  if (hasAdminSession(req)) {
    return true;
  }

  throw new AppError('Unauthorized', 401);
}

function parseCookies(cookieHeader = '') {
  const cookies = {};
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signAdminSession(timestamp) {
  return createHmac('sha256', config.adminApiKey).update(String(timestamp)).digest('base64url');
}

export function createAdminSessionToken(now = Date.now()) {
  const timestamp = Math.trunc(now);
  return `${timestamp}.${signAdminSession(timestamp)}`;
}

export function serializeAdminSessionCookie(request, now = Date.now()) {
  const url = new URL(request.url);
  const parts = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(createAdminSessionToken(now))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ADMIN_SESSION_MAX_AGE_SECONDS}`
  ];

  if (url.protocol === 'https:') parts.push('Secure');
  if (config.cookieDomain) parts.push(`Domain=${config.cookieDomain}`);

  return parts.join('; ');
}

export function serializeAdminLogoutCookie(request) {
  const url = new URL(request.url);
  const parts = [
    `${ADMIN_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];

  if (url.protocol === 'https:') parts.push('Secure');
  if (config.cookieDomain) parts.push(`Domain=${config.cookieDomain}`);

  return parts.join('; ');
}

export function verifyAdminSessionToken(sessionToken, now = Date.now()) {
  if (!sessionToken) return false;

  const [timestampPart, signature] = String(sessionToken).split('.');
  const timestamp = Number(timestampPart);
  if (!Number.isFinite(timestamp) || !signature) return false;

  const expected = signAdminSession(timestamp);
  if (!safeEqual(signature, expected)) return false;

  const ageMs = Math.max(0, now - timestamp);
  return ageMs <= ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
}

export function hasAdminSession(request) {
  const headers = request.headers || request;
  const cookies = parseCookies(headerValue(headers, 'cookie'));
  return verifyAdminSessionToken(cookies[ADMIN_SESSION_COOKIE]);
}

export function adminSessionCookieName() {
  return ADMIN_SESSION_COOKIE;
}

export function adminSessionMaxAgeSeconds() {
  return ADMIN_SESSION_MAX_AGE_SECONDS;
}

export function isAdminKeyValid(provided) {
  return Boolean(provided) && provided === config.adminApiKey;
}
