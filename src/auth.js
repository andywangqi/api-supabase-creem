import { config, missing } from './config.js';
import { AppError } from './supabase.js';

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

  if (!provided || provided !== config.adminApiKey) {
    throw new AppError('Unauthorized', 401);
  }
}
