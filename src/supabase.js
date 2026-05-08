import { config, missing } from './config.js';

export class AppError extends Error {
  constructor(message, statusCode = 500, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function requireSupabase() {
  const miss = missing(['supabaseUrl', 'supabaseServiceRoleKey']);
  if (miss.length) {
    throw new AppError(`Missing Supabase config: ${miss.join(', ')}`, 500);
  }
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function supabaseFetch(path, options = {}) {
  requireSupabase();

  const response = await fetch(`${config.supabaseUrl}/rest/v1${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: config.supabaseServiceRoleKey,
      authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'accept-profile': config.supabaseSchema,
      'content-profile': config.supabaseSchema,
      ...(options.prefer ? { prefer: options.prefer } : {}),
      ...(options.headers || {})
    },
    body: options.body == null ? undefined : JSON.stringify(options.body)
  });

  const body = await parseResponse(response);
  if (!response.ok) {
    throw new AppError('Supabase request failed', response.status, body);
  }

  return body;
}

export async function rpc(functionName, body = {}) {
  return supabaseFetch(`/rpc/${encodeURIComponent(functionName)}`, {
    method: 'POST',
    body
  });
}

function nowIso() {
  return new Date().toISOString();
}

function rowOrFirst(rows) {
  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function findUserByAnonymousId(anonymousId) {
  if (!anonymousId) return null;

  const rows = await supabaseFetch(
    `/app_users?anonymous_id=eq.${encodeURIComponent(anonymousId)}&select=*`
  );
  return rowOrFirst(rows);
}

export async function findUserByEmail(email) {
  if (!email) return null;

  const rows = await supabaseFetch(
    `/app_users?email=eq.${encodeURIComponent(String(email).toLowerCase())}&select=*`
  );
  return rowOrFirst(rows);
}

export async function updateUserById(id, patch) {
  if (!id) {
    throw new AppError('user id is required', 400);
  }

  const rows = await supabaseFetch(`/app_users?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: {
      ...patch,
      last_seen_at: patch.last_seen_at || nowIso()
    }
  });

  return rowOrFirst(rows);
}

export async function touchUser(id) {
  return updateUserById(id, { last_seen_at: nowIso() });
}

export async function upsertAnonymousUser({ anonymousId, metadata = {} }) {
  if (!anonymousId) {
    throw new AppError('anonymousId is required', 400);
  }

  const rows = await supabaseFetch('/app_users?on_conflict=anonymous_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      anonymous_id: anonymousId,
      is_anonymous: true,
      metadata,
      last_seen_at: nowIso()
    }
  });

  return rowOrFirst(rows);
}

export async function upsertUser({ id, anonymousId, email, name, creemCustomerId, metadata = {}, isAnonymous = false }) {
  if (!email) {
    throw new AppError('email is required', 400);
  }

  const payload = {
    ...(id ? { external_id: id } : {}),
    ...(anonymousId ? { anonymous_id: anonymousId } : {}),
    ...(email ? { email: String(email).toLowerCase() } : {}),
    ...(name ? { name } : {}),
    is_anonymous: isAnonymous,
    ...(creemCustomerId ? { creem_customer_id: creemCustomerId } : {}),
    metadata,
    last_seen_at: nowIso()
  };

  const rows = await supabaseFetch('/app_users?on_conflict=email', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: payload
  });

  return rowOrFirst(rows);
}

export async function insertPayment(payment) {
  const rows = await supabaseFetch('/payments?on_conflict=creem_event_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: payment
  });

  return rowOrFirst(rows);
}
