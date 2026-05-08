import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import {
  findUserByAnonymousId,
  findUserByEmail,
  updateUserById,
  touchUser,
  upsertAnonymousUser,
  upsertUser
} from './supabase.js';

const ANONYMOUS_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

function headerValue(request, name) {
  return request.headers.get(name) || '';
}

export function parseCookies(cookieHeader = '') {
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

export function normalizeAnonymousId(value) {
  if (!value) return '';
  const normalized = String(value).trim();
  return ANONYMOUS_ID_PATTERN.test(normalized) ? normalized : '';
}

function normalizeEmail(value) {
  if (!value) return '';
  const email = String(value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function metadataFrom(input, source) {
  return {
    source,
    ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {})
  };
}

export function toPublicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    externalId: user.external_id || null,
    anonymousId: user.anonymous_id || null,
    email: user.email || null,
    name: user.name || null,
    isAnonymous: Boolean(user.is_anonymous),
    createdAt: user.created_at,
    lastSeenAt: user.last_seen_at
  };
}

export function serializeAnonymousCookie(request, anonymousId) {
  const url = new URL(request.url);
  const parts = [
    `${config.anonCookieName}=${encodeURIComponent(anonymousId)}`,
    'Path=/',
    'Max-Age=31536000',
    'HttpOnly',
    'SameSite=Lax'
  ];

  if (url.protocol === 'https:') parts.push('Secure');
  if (config.cookieDomain) parts.push(`Domain=${config.cookieDomain}`);

  return parts.join('; ');
}

async function identifyUser(input, anonymousId) {
  const email = normalizeEmail(input.email);
  const externalId = input.userId || input.user_id || input.externalId || input.external_id || '';

  if (!email) return null;

  const existingEmailUser = await findUserByEmail(email);
  if (existingEmailUser) {
    return updateUserById(existingEmailUser.id, {
      ...(externalId ? { external_id: externalId } : {}),
      ...(input.name ? { name: input.name } : {}),
      is_anonymous: false,
      metadata: {
        ...(existingEmailUser.metadata || {}),
        ...metadataFrom(input, 'site_identify')
      }
    });
  }

  const existingAnonymousUser = anonymousId ? await findUserByAnonymousId(anonymousId) : null;
  if (existingAnonymousUser) {
    return updateUserById(existingAnonymousUser.id, {
      ...(externalId ? { external_id: externalId } : {}),
      email,
      ...(input.name ? { name: input.name } : {}),
      is_anonymous: false,
      metadata: {
        ...(existingAnonymousUser.metadata || {}),
        ...metadataFrom(input, 'site_identify')
      }
    });
  }

  return upsertUser({
    id: externalId,
    anonymousId,
    email,
    name: input.name,
    isAnonymous: false,
    metadata: metadataFrom(input, 'site_identify')
  });
}

export async function getOrCreateSiteSession(request, input = {}) {
  const cookies = parseCookies(headerValue(request, 'cookie'));
  const incomingAnonymousId = normalizeAnonymousId(
    input.anonymousId ||
    input.anonymous_id ||
    headerValue(request, 'x-anonymous-id') ||
    cookies[config.anonCookieName]
  );
  const anonymousId = incomingAnonymousId || randomUUID();

  let user = await identifyUser(input, anonymousId);
  let created = false;

  if (!user) {
    user = incomingAnonymousId ? await findUserByAnonymousId(incomingAnonymousId) : null;
    if (user) {
      user = await touchUser(user.id);
    } else {
      created = true;
      user = await upsertAnonymousUser({
        anonymousId,
        metadata: metadataFrom(input, 'anonymous_session')
      });
    }
  }

  const publicUser = toPublicUser(user);
  const finalAnonymousId = publicUser?.anonymousId || anonymousId;

  return {
    body: {
      user: publicUser,
      anonymousId: finalAnonymousId,
      isNewUser: created,
      mode: publicUser?.isAnonymous ? 'anonymous' : 'identified'
    },
    headers: {
      'set-cookie': serializeAnonymousCookie(request, finalAnonymousId),
      'x-anonymous-id': finalAnonymousId
    }
  };
}
