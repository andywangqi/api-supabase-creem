import { readFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAdmin } from './auth.js';
import { createCreemCheckout, handleCreemWebhook } from './creem.js';
import { getAdminMetrics } from './metrics.js';
import { getOrCreateSiteSession } from './site.js';
import { AppError, upsertUser } from './supabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(join(__dirname, '..', 'public'));

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon']
]);

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  if (!origin) return {};

  return {
    'access-control-allow-origin': origin,
    vary: 'origin',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-admin-key,x-anonymous-id'
  };
}

function response(request, body, init = {}) {
  return new Response(body, {
    ...init,
    headers: {
      ...corsHeaders(request),
      ...(init.headers || {})
    }
  });
}

function jsonResponse(request, status, payload, headers = {}) {
  return response(request, JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers
    }
  });
}

function errorResponse(request, status, message, details) {
  return jsonResponse(request, status, {
    error: {
      message,
      ...(details ? { details } : {})
    }
  });
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('Invalid JSON body', 400);
  }
}

async function readRawBody(request, maxBytes = 1024 * 1024) {
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length > maxBytes) {
    throw new AppError('Request body too large', 413);
  }
  return body;
}

async function staticResponse(request, requestPath) {
  const cleanPath = requestPath === '/' ? '/admin.html' : requestPath;
  const decodedPath = decodeURIComponent(cleanPath.split('?')[0]);
  const safePath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = resolve(join(publicDir, safePath));

  if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${sep}`)) {
    return null;
  }

  try {
    const file = await readFile(filePath);
    const extension = filePath.slice(filePath.lastIndexOf('.'));
    return response(request, file, {
      status: 200,
      headers: {
        'content-type': mimeTypes.get(extension) || 'application/octet-stream',
        'cache-control': extension === '.html' ? 'no-store' : 'public, max-age=3600'
      }
    });
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function route(request) {
  if (request.method === 'OPTIONS') {
    return response(request, null, { status: 204 });
  }

  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/') {
    return response(request, null, {
      status: 302,
      headers: { location: '/admin' }
    });
  }

  if (request.method === 'GET' && url.pathname === '/admin') {
    const page = await staticResponse(request, '/admin.html');
    if (page) return page;
  }

  if (request.method === 'GET' && url.pathname === '/payment-success') {
    const page = await staticResponse(request, '/payment-success.html');
    if (page) return page;
  }

  if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) {
    return jsonResponse(request, 200, {
      ok: true,
      service: 'api-supabase-creem',
      time: new Date().toISOString()
    });
  }

  if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/api/site/session') {
    const body = request.method === 'POST' ? await readJson(request) : {};
    const session = await getOrCreateSiteSession(request, body);
    return jsonResponse(request, 200, session.body, session.headers);
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/metrics') {
    requireAdmin(request);
    const days = url.searchParams.get('days') || 30;
    return jsonResponse(request, 200, await getAdminMetrics(days));
  }

  if (request.method === 'POST' && url.pathname === '/api/users') {
    const body = await readJson(request);
    const user = await upsertUser({
      id: body.id || body.userId,
      email: body.email,
      name: body.name,
      creemCustomerId: body.creemCustomerId || body.creem_customer_id,
      metadata: body.metadata || {}
    });
    return jsonResponse(request, 201, { user });
  }

  if (request.method === 'POST' && url.pathname === '/api/creem/checkout') {
    const body = await readJson(request);
    return jsonResponse(request, 201, await createCreemCheckout(body));
  }

  if (request.method === 'POST' && url.pathname === '/api/creem/webhook') {
    const rawBody = await readRawBody(request);
    return jsonResponse(request, 200, await handleCreemWebhook(rawBody, request.headers));
  }

  if (request.method === 'GET') {
    const file = await staticResponse(request, url.pathname);
    if (file) return file;
  }

  return errorResponse(request, 404, 'Not found');
}

export async function handleRequest(request) {
  try {
    return await route(request);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : error.statusCode || 500;
    return errorResponse(request, statusCode, error.message || 'Internal server error', error.details);
  }
}
