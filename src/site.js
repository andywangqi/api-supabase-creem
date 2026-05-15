import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import {
  findUserByAnonymousId,
  findUserByEmail,
  mergeAppUsers,
  updateUserById,
  touchUser,
  upsertAnonymousUser,
  upsertUser
} from './supabase.js';

const ANONYMOUS_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const IP_HEADER_NAMES = [
  'x-forwarded-for',
  'x-real-ip',
  'x-client-ip',
  'cf-connecting-ip',
  'x-vercel-forwarded-for',
  'forwarded'
];
const COUNTRY_HEADER_NAMES = [
  'x-vercel-ip-country',
  'cf-ipcountry',
  'cloudfront-viewer-country',
  'x-country-code'
];

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

export function normalizeClientIp(value) {
  if (!value) return '';

  let ip = String(value)
    .split(',')
    .map((part) => part.trim())
    .find((part) => part && part.toLowerCase() !== 'unknown') || '';

  ip = ip.replace(/^for=/i, '').trim().replace(/^"|"$/g, '');

  const semicolonIndex = ip.indexOf(';');
  if (semicolonIndex !== -1) ip = ip.slice(0, semicolonIndex).trim().replace(/^"|"$/g, '');

  if (ip.startsWith('[')) {
    const bracketIndex = ip.indexOf(']');
    if (bracketIndex !== -1) ip = ip.slice(1, bracketIndex);
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.replace(/:\d+$/, '');
  }

  return /^[a-zA-Z0-9:._-]{3,64}$/.test(ip) ? ip : '';
}

export function normalizeCountry(value) {
  const country = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : '';
}

function firstRequestHeader(request, names) {
  for (const name of names) {
    const value = headerValue(request, name);
    if (value) return value;
  }
  return '';
}

export function clientLocationFromRequest(request) {
  const lastIp = normalizeClientIp(firstRequestHeader(request, IP_HEADER_NAMES));
  const lastCountry = normalizeCountry(firstRequestHeader(request, COUNTRY_HEADER_NAMES));

  return {
    ...(lastIp ? { last_ip: lastIp } : {}),
    ...(lastCountry ? { last_country: lastCountry } : {})
  };
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
    creditsBalance: Number(user.credits_balance || 0),
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

async function identifyUser(input, anonymousId, clientLocation = {}) {
  const email = normalizeEmail(input.email);
  const externalId = input.userId || input.user_id || input.externalId || input.external_id || '';

  if (!email) return null;

  let currentUser = anonymousId ? await findUserByAnonymousId(anonymousId) : null;
  if (!currentUser && anonymousId) {
    currentUser = await upsertAnonymousUser({
      anonymousId,
      lastIp: clientLocation.last_ip,
      lastCountry: clientLocation.last_country,
      useAnonymousIdAsPrimary: true,
      metadata: metadataFrom(input, 'anonymous_session')
    });
  }

  const existingEmailUser = await findUserByEmail(email);

  if (currentUser) {
    if (existingEmailUser && existingEmailUser.id !== currentUser.id) {
      currentUser = await mergeAppUsers({
        targetUserId: currentUser.id,
        sourceUserId: existingEmailUser.id
      }) || currentUser;
    }

    return updateUserById(currentUser.id, {
      ...clientLocation,
      ...(externalId ? { external_id: externalId } : {}),
      email,
      ...(input.name ? { name: input.name } : {}),
      is_anonymous: false,
      metadata: {
        ...(currentUser.metadata || {}),
        ...metadataFrom(input, 'site_identify')
      }
    });
  }

  if (existingEmailUser) {
    return updateUserById(existingEmailUser.id, {
      ...clientLocation,
      ...(externalId ? { external_id: externalId } : {}),
      ...(input.name ? { name: input.name } : {}),
      is_anonymous: false,
      metadata: {
        ...(existingEmailUser.metadata || {}),
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
    lastIp: clientLocation.last_ip,
    lastCountry: clientLocation.last_country,
    metadata: metadataFrom(input, 'site_identify')
  });
}

export async function getOrCreateSiteSession(request, input = {}) {
  const clientLocation = clientLocationFromRequest(request);
  const cookies = parseCookies(headerValue(request, 'cookie'));
  const incomingAnonymousId = normalizeAnonymousId(
    input.anonymousId ||
    input.anonymous_id ||
    headerValue(request, 'x-anonymous-id') ||
    cookies[config.anonCookieName]
  );
  const anonymousId = incomingAnonymousId || randomUUID();

  let user = await identifyUser(input, anonymousId, clientLocation);
  let created = false;

  if (!user) {
    user = incomingAnonymousId ? await findUserByAnonymousId(incomingAnonymousId) : null;
    if (user) {
      user = await touchUser(user.id, clientLocation);
    } else {
      created = true;
      user = await upsertAnonymousUser({
        anonymousId,
        lastIp: clientLocation.last_ip,
        lastCountry: clientLocation.last_country,
        useAnonymousIdAsPrimary: true,
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
