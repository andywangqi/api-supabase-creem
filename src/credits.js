import { config } from './config.js';
import { parseCookies, normalizeAnonymousId } from './site.js';
import { AppError, firstRow, rpc, supabaseFetch } from './supabase.js';

function clampLimit(value, fallback = 50) {
  const number = Number(value || fallback);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), 1), 100);
}

function clampOffset(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(Math.trunc(number), 0);
}

export function normalizeCreditAmount(value) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError('Credit amount must be a positive integer', 400);
  }
  return amount;
}

export function toPublicUserCredit(row) {
  if (!row) return null;
  return {
    userId: row.id,
    email: row.email || null,
    anonymousId: row.anonymous_id || null,
    name: row.name || null,
    isAnonymous: Boolean(row.is_anonymous),
    creditsBalance: Number(row.credits_balance || 0),
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  };
}

function userSelect() {
  return 'id,email,anonymous_id,name,is_anonymous,credits_balance,created_at,last_seen_at';
}

export async function findUserById(id) {
  if (!id) return null;
  const rows = await supabaseFetch(
    `/app_users?id=eq.${encodeURIComponent(id)}&select=${userSelect()}&limit=1`
  );
  return firstRow(rows);
}

export async function listAdminUsers({ limit, offset, search } = {}) {
  const safeLimit = clampLimit(limit, 50);
  const safeOffset = clampOffset(offset);
  let path = `/app_users?select=${userSelect()}&order=created_at.desc&limit=${safeLimit}&offset=${safeOffset}`;

  const cleanSearch = String(search || '').trim();
  if (cleanSearch) {
    const pattern = `*${cleanSearch.replace(/[(),]/g, ' ')}*`;
    path += `&or=(email.ilike.${encodeURIComponent(pattern)},anonymous_id.ilike.${encodeURIComponent(pattern)},name.ilike.${encodeURIComponent(pattern)})`;
  }

  const rows = await supabaseFetch(path);
  return Array.isArray(rows) ? rows.map(toPublicUserCredit) : [];
}

export async function getUserCredits(userId) {
  const user = await findUserById(userId);
  if (!user) throw new AppError('User not found', 404);
  return toPublicUserCredit(user);
}

export async function getCurrentSiteUserCredits(request) {
  const cookies = parseCookies(request.headers.get('cookie') || '');
  const anonymousId = normalizeAnonymousId(
    request.headers.get('x-anonymous-id') || cookies[config.anonCookieName]
  );

  if (!anonymousId) {
    throw new AppError('Anonymous session is required', 401);
  }

  const rows = await supabaseFetch(
    `/app_users?anonymous_id=eq.${encodeURIComponent(anonymousId)}&select=${userSelect()}&limit=1`
  );
  const user = firstRow(rows);
  if (!user) throw new AppError('User not found', 404);
  return toPublicUserCredit(user);
}

export async function adjustUserCredits({
  userId,
  amount,
  action,
  source,
  reason,
  metadata,
  createdBy,
  idempotencyKey,
  allowNegative = false
}) {
  const normalizedAmount = normalizeCreditAmount(amount);
  const delta = action === 'deduct' ? -normalizedAmount : normalizedAmount;
  const rows = await rpc('adjust_user_credits', {
    p_user_id: userId,
    p_delta: delta,
    p_source: source || `admin_${action || 'add'}`,
    p_reason: reason || null,
    p_metadata: metadata && typeof metadata === 'object' ? metadata : {},
    p_created_by: createdBy || null,
    p_idempotency_key: idempotencyKey || null,
    p_allow_negative: Boolean(allowNegative)
  });

  const result = firstRow(rows);
  if (!result) throw new AppError('Credit adjustment failed', 500);

  return {
    userId: result.user_id,
    creditsBalance: Number(result.credits_balance || 0),
    transactionId: result.transaction_id
  };
}

export async function deductCurrentSiteUserCredits(request, input = {}) {
  const current = await getCurrentSiteUserCredits(request);
  const result = await adjustUserCredits({
    userId: current.userId,
    amount: input.amount,
    action: 'deduct',
    source: input.source || 'site_deduct',
    reason: input.reason || null,
    metadata: input.metadata || {},
    idempotencyKey: input.idempotencyKey || input.idempotency_key || null
  });

  return {
    ...current,
    creditsBalance: result.creditsBalance,
    transactionId: result.transactionId
  };
}
