import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import {
  clientLocationFromRequest,
  parseCookies,
  normalizeAnonymousId,
  toPublicUser,
  getOrCreateSiteSession
} from './site.js';
import {
  AppError,
  findUserByAnonymousId,
  findUserByEmail,
  firstRow,
  mergeAppUsers,
  supabaseFetch,
  upsertAnonymousUser,
  updateUserById
} from './supabase.js';

function base64UrlJson(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function bearerToken(request) {
  const authorization = request.headers.get('authorization') || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

export function verifySupabaseJwt(token) {
  if (!token) throw new AppError('Supabase access token is required', 401);

  const parts = token.split('.');
  if (parts.length !== 3) throw new AppError('Invalid Supabase access token', 401);

  const [headerPart, payloadPart, signature] = parts;
  let header;
  let payload;
  try {
    header = base64UrlJson(headerPart);
    payload = base64UrlJson(payloadPart);
  } catch {
    throw new AppError('Invalid Supabase access token payload', 401);
  }

  if (config.supabaseJwtSecret) {
    if (header.alg !== 'HS256') throw new AppError('Unsupported Supabase JWT algorithm', 401);
    const expected = createHmac('sha256', config.supabaseJwtSecret)
      .update(`${headerPart}.${payloadPart}`)
      .digest('base64url');
    if (!safeEqual(signature, expected)) throw new AppError('Invalid Supabase access token signature', 401);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) throw new AppError('Supabase access token expired', 401);
  }

  if (!payload.sub) throw new AppError('Supabase access token subject is required', 401);
  return payload;
}

async function findUserByAuthProviderId(authProviderUserId) {
  if (!authProviderUserId) return null;
  const rows = await supabaseFetch(
    `/app_users?auth_provider_user_id=eq.${encodeURIComponent(authProviderUserId)}&select=*&limit=1`
  );
  return firstRow(rows);
}

async function createAuthUser(payload) {
  const rows = await supabaseFetch('/app_users?on_conflict=auth_provider_user_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: payload
  });
  return firstRow(rows);
}

async function mergeUsersIntoTarget(targetUser, users) {
  let target = targetUser;
  const seen = new Set([target.id]);

  for (const user of users) {
    if (!user || seen.has(user.id)) continue;
    target = await mergeAppUsers({
      targetUserId: target.id,
      sourceUserId: user.id
    }) || target;
    seen.add(user.id);
  }

  return target;
}

function profileFrom(input, claims) {
  const metadata = claims.user_metadata || {};
  return {
    authProviderUserId: claims.sub || input.id,
    email: claims.email || input.email || metadata.email || '',
    name: input.name || metadata.full_name || metadata.name || claims.name || '',
    avatarUrl: input.avatarUrl || input.avatar_url || metadata.avatar_url || metadata.picture || ''
  };
}

export async function saveSupabaseAuthUser(request, input = {}) {
  const token = bearerToken(request);
  const claims = token ? verifySupabaseJwt(token) : {};
  if (!token && config.supabaseJwtSecret) throw new AppError('Supabase access token is required', 401);

  const profile = profileFrom(input, claims);
  if (!profile.authProviderUserId) throw new AppError('Supabase user id is required', 400);
  if (!profile.email) throw new AppError('Supabase user email is required', 400);

  const cookies = parseCookies(request.headers.get('cookie') || '');
  const anonymousId = normalizeAnonymousId(
    cookies[config.anonCookieName] ||
    input.anonymousId ||
    input.anonymous_id ||
    request.headers.get('x-anonymous-id')
  );
  const clientLocation = clientLocationFromRequest(request);

  const buildPatch = (existingUser = {}) => ({
    ...clientLocation,
    auth_provider: 'supabase_google',
    auth_provider_user_id: profile.authProviderUserId,
    email: profile.email.toLowerCase(),
    ...(profile.name ? { name: profile.name } : {}),
    ...(profile.avatarUrl ? { avatar_url: profile.avatarUrl } : {}),
    is_anonymous: false,
    metadata: {
      ...(existingUser.metadata || {}),
      source: 'supabase_google'
    }
  });

  let currentUser = anonymousId ? await findUserByAnonymousId(anonymousId) : null;
  const authUser = await findUserByAuthProviderId(profile.authProviderUserId);
  const emailUser = await findUserByEmail(profile.email);

  if (!currentUser && anonymousId) {
    currentUser = await upsertAnonymousUser({
      anonymousId,
      lastIp: clientLocation.last_ip,
      lastCountry: clientLocation.last_country,
      useAnonymousIdAsPrimary: true,
      metadata: { source: 'anonymous_session' }
    });
  }

  if (currentUser) {
    currentUser = await mergeUsersIntoTarget(currentUser, [authUser, emailUser]);
    return updateUserById(currentUser.id, buildPatch(currentUser));
  }

  if (authUser) {
    const target = await mergeUsersIntoTarget(authUser, [emailUser]);
    return updateUserById(target.id, buildPatch(target));
  }

  if (emailUser) return updateUserById(emailUser.id, buildPatch(emailUser));

  return createAuthUser({
    ...buildPatch(),
    anonymous_id: anonymousId || null
  });
}

export async function getCurrentActor(request, { requireAuth = false, createAnonymous = true } = {}) {
  const token = bearerToken(request);
  if (token || requireAuth) {
    const user = await saveSupabaseAuthUser(request, {});
    return {
      user,
      publicUser: toPublicUser(user),
      headers: {},
      isAuthenticated: true
    };
  }

  if (!createAnonymous) {
    const cookies = parseCookies(request.headers.get('cookie') || '');
    const anonymousId = normalizeAnonymousId(cookies[config.anonCookieName] || request.headers.get('x-anonymous-id'));
    const user = anonymousId ? await findUserByAnonymousId(anonymousId) : null;
    if (!user) throw new AppError('Anonymous session is required', 401);
    return {
      user,
      publicUser: toPublicUser(user),
      headers: {},
      isAuthenticated: false
    };
  }

  const session = await getOrCreateSiteSession(request, {});
  return {
    user: {
      id: session.body.user.id,
      anonymous_id: session.body.user.anonymousId,
      email: session.body.user.email,
      name: session.body.user.name,
      is_anonymous: session.body.user.isAnonymous,
      credits_balance: session.body.user.creditsBalance,
      created_at: session.body.user.createdAt,
      last_seen_at: session.body.user.lastSeenAt
    },
    publicUser: session.body.user,
    headers: session.headers,
    isAuthenticated: false
  };
}
