import { readFile } from 'node:fs/promises';
import { basename, dirname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  hasAdminSession,
  isAdminKeyValid,
  requireAdmin,
  serializeAdminLogoutCookie,
  serializeAdminSessionCookie
} from './auth.js';
import {
  saveSupabaseAuthUser,
  getCurrentActor
} from './auth-supabase.js';
import {
  createSiteCheckout
} from './billing.js';
import {
  createBlogPost,
  deleteBlogPost,
  getPublishedBlogPost,
  listAdminBlogPosts,
  listPublishedBlogPosts,
  updateBlogPost
} from './blog.js';
import { createCreemCheckout, handleCreemWebhook } from './creem.js';
import {
  adjustUserCredits,
  deductCurrentSiteUserCredits,
  getCurrentSiteUserCredits,
  getUserCredits,
  listAdminUsers
} from './credits.js';
import { getAdminMetrics } from './metrics.js';
import { createTryOnGeneration } from './generations.js';
import { createFaceReport, getFaceReportForUser, ensureReportOwnedByUser, reportAccess } from './reports.js';
import { clientLocationFromRequest, getOrCreateSiteSession } from './site.js';
import { getActiveSubscription } from './subscriptions.js';
import { detectAllowanceForUser } from './usage.js';
import { missing } from './config.js';
import { AppError, upsertUser } from './supabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(join(__dirname, '..', 'public'));
const adminViewPath = resolve(join(__dirname, 'views', 'admin.html'));
const adminLoginViewPath = resolve(join(__dirname, 'views', 'admin-login.html'));

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

function isAdminPagePath(pathname) {
  return pathname === '/admin' || pathname === '/api/admin-page';
}

function isAdminLoginPagePath(pathname) {
  return pathname === '/admin/login' || pathname === '/api/admin-login-page';
}

function resolveRequestPath(url) {
  if (url.pathname !== '/api/route') return url.pathname;

  const path = url.searchParams.get('path') || '';
  if (!path) return url.pathname;

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (cleanPath.startsWith('/api/')) return cleanPath;

  return `/api${cleanPath}`;
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
    const fileName = basename(filePath);
    const isAdminAsset = ['admin.css', 'admin.js', 'admin-login.js'].includes(fileName);
    return response(request, file, {
      status: 200,
      headers: {
        'content-type': mimeTypes.get(extension) || 'application/octet-stream',
        'cache-control': extension === '.html' || isAdminAsset ? 'no-store' : 'public, max-age=3600'
      }
    });
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function viewResponse(request, filePath) {
  try {
    const file = await readFile(filePath);
    return response(request, file, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
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
  const pathname = resolveRequestPath(url);

  if (request.method === 'GET' && pathname === '/') {
    return response(request, null, {
      status: 302,
      headers: { location: '/admin' }
    });
  }

  if (request.method === 'GET' && isAdminPagePath(pathname)) {
    if (!hasAdminSession(request)) {
      return response(request, null, {
        status: 302,
        headers: { location: '/admin/login' }
      });
    }

    const page = await viewResponse(request, adminViewPath);
    if (page) return page;
  }

  if (request.method === 'GET' && isAdminLoginPagePath(pathname)) {
    if (hasAdminSession(request)) {
      return response(request, null, {
        status: 302,
        headers: { location: '/admin' }
      });
    }

    const page = await viewResponse(request, adminLoginViewPath);
    if (page) return page;
  }

  if (request.method === 'GET' && pathname === '/payment-success') {
    const page = await staticResponse(request, '/payment-success.html');
    if (page) return page;
  }

  if (request.method === 'GET' && (pathname === '/health' || pathname === '/api/health')) {
    return jsonResponse(request, 200, {
      ok: true,
      service: 'api-supabase-creem',
      time: new Date().toISOString()
    });
  }

  if ((request.method === 'GET' || request.method === 'POST') && pathname === '/api/site/session') {
    const body = request.method === 'POST' ? await readJson(request) : {};
    const session = await getOrCreateSiteSession(request, body);
    return jsonResponse(request, 200, session.body, session.headers);
  }

  if (request.method === 'POST' && pathname === '/api/auth/supabase') {
    const user = await saveSupabaseAuthUser(request, await readJson(request));
    return jsonResponse(request, 200, {
      user: {
        id: user.id,
        email: user.email || null,
        name: user.name || null,
        avatarUrl: user.avatar_url || null,
        creditsBalance: Number(user.credits_balance || 0),
        createdAt: user.created_at,
        lastSeenAt: user.last_seen_at
      },
      subscription: await getActiveSubscription(user.id)
    });
  }

  if (request.method === 'GET' && pathname === '/api/admin/session') {
    return jsonResponse(request, 200, {
      authenticated: hasAdminSession(request)
    });
  }

  if (request.method === 'POST' && pathname === '/api/admin/login') {
    const miss = missing(['adminApiKey']);
    if (miss.length) {
      throw new AppError('Missing ADMIN_API_KEY', 500);
    }

    const body = await readJson(request);
    const provided =
      body.adminKey ||
      body.admin_key ||
      request.headers.get('x-admin-key') ||
      (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');

    if (!isAdminKeyValid(provided)) {
      throw new AppError('Unauthorized', 401);
    }

    return jsonResponse(request, 200, {
      ok: true
    }, {
      'set-cookie': serializeAdminSessionCookie(request)
    });
  }

  if (request.method === 'POST' && pathname === '/api/admin/logout') {
    return jsonResponse(request, 200, {
      ok: true
    }, {
      'set-cookie': serializeAdminLogoutCookie(request)
    });
  }

  if (request.method === 'GET' && pathname === '/api/site/credits') {
    return jsonResponse(request, 200, {
      user: await getCurrentSiteUserCredits(request)
    });
  }

  if (request.method === 'POST' && pathname === '/api/site/credits/deduct') {
    return jsonResponse(request, 200, {
      user: await deductCurrentSiteUserCredits(request, await readJson(request))
    });
  }

  if (request.method === 'POST' && pathname === '/api/face/detect/allow') {
    const actor = await getCurrentActor(request, { createAnonymous: true });
    return jsonResponse(request, 200, await detectAllowanceForUser(actor.user), actor.headers);
  }

  if (request.method === 'POST' && pathname === '/api/face/reports') {
    const actor = await getCurrentActor(request, { createAnonymous: true });
    return jsonResponse(request, 201, {
      report: await createFaceReport(actor.user, await readJson(request))
    }, actor.headers);
  }

  const faceReportMatch = pathname.match(/^\/api\/face\/reports\/([^/]+)$/);
  if (faceReportMatch && request.method === 'GET') {
    const actor = await getCurrentActor(request, { createAnonymous: false });
    return jsonResponse(request, 200, {
      report: await getFaceReportForUser(actor.user, faceReportMatch[1])
    }, actor.headers);
  }

  if (request.method === 'GET' && pathname === '/api/site/access') {
    const actor = await getCurrentActor(request, { createAnonymous: true });
    const reportId = url.searchParams.get('reportId');
    const subscription = await getActiveSubscription(actor.user.id);
    let report = null;
    if (reportId) {
      await ensureReportOwnedByUser(actor.user, reportId);
      const access = await reportAccess(actor.user, reportId);
      report = {
        unlocked: access.unlocked,
        source: access.source
      };
    }
    return jsonResponse(request, 200, {
      user: {
        id: actor.user.id,
        email: actor.user.email || null,
        creditsBalance: Number(actor.user.credits_balance || 0)
      },
      subscription: subscription || { active: false },
      ...(report ? { report } : {})
    }, actor.headers);
  }

  if (request.method === 'POST' && pathname === '/api/site/checkout') {
    const actor = await getCurrentActor(request, { createAnonymous: true });
    return jsonResponse(request, 201, await createSiteCheckout(actor.user, await readJson(request)), actor.headers);
  }

  if (request.method === 'POST' && pathname === '/api/ai/try-on') {
    const actor = await getCurrentActor(request, { requireAuth: true });
    return jsonResponse(request, 201, {
      generation: await createTryOnGeneration(actor.user, await readJson(request))
    });
  }

  if (request.method === 'GET' && pathname === '/api/admin/metrics') {
    requireAdmin(request);
    const days = url.searchParams.get('days') || 30;
    return jsonResponse(request, 200, await getAdminMetrics(days));
  }

  if (request.method === 'GET' && pathname === '/api/admin/users') {
    requireAdmin(request);
    return jsonResponse(request, 200, {
      users: await listAdminUsers({
        limit: url.searchParams.get('limit'),
        offset: url.searchParams.get('offset'),
        search: url.searchParams.get('search')
      })
    });
  }

  const adminUserCreditsMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/credits(?:\/(add|deduct))?$/);
  if (adminUserCreditsMatch && request.method === 'GET') {
    requireAdmin(request);
    return jsonResponse(request, 200, {
      user: await getUserCredits(adminUserCreditsMatch[1])
    });
  }

  if (adminUserCreditsMatch && request.method === 'POST') {
    requireAdmin(request);
    const body = await readJson(request);
    const action = adminUserCreditsMatch[2] || body.action || 'add';
    if (action !== 'add' && action !== 'deduct') {
      throw new AppError('Credit action must be add or deduct', 400);
    }
    return jsonResponse(request, 200, {
      credits: await adjustUserCredits({
        userId: adminUserCreditsMatch[1],
        amount: body.amount,
        action,
        source: body.source || `admin_${action}`,
        reason: body.reason,
        metadata: body.metadata,
        createdBy: 'admin',
        idempotencyKey: body.idempotencyKey || body.idempotency_key,
        allowNegative: body.allowNegative || body.allow_negative
      })
    });
  }

  if (request.method === 'GET' && pathname === '/api/admin/blogs') {
    requireAdmin(request);
    return jsonResponse(request, 200, {
      blogs: await listAdminBlogPosts({
        limit: url.searchParams.get('limit'),
        offset: url.searchParams.get('offset')
      })
    });
  }

  if (request.method === 'POST' && pathname === '/api/admin/blogs') {
    requireAdmin(request);
    return jsonResponse(request, 201, {
      blog: await createBlogPost(await readJson(request))
    });
  }

  const adminBlogMatch = pathname.match(/^\/api\/admin\/blogs\/([^/]+)$/);
  if (adminBlogMatch && request.method === 'PATCH') {
    requireAdmin(request);
    return jsonResponse(request, 200, {
      blog: await updateBlogPost(adminBlogMatch[1], await readJson(request))
    });
  }

  if (adminBlogMatch && request.method === 'DELETE') {
    requireAdmin(request);
    return jsonResponse(request, 200, await deleteBlogPost(adminBlogMatch[1]));
  }

  if (request.method === 'GET' && pathname === '/api/blogs') {
    return jsonResponse(request, 200, {
      blogs: await listPublishedBlogPosts({
        limit: url.searchParams.get('limit'),
        offset: url.searchParams.get('offset')
      })
    });
  }

  const publicBlogMatch = pathname.match(/^\/api\/blogs\/([^/]+)$/);
  if (publicBlogMatch && request.method === 'GET') {
    return jsonResponse(request, 200, {
      blog: await getPublishedBlogPost(publicBlogMatch[1])
    });
  }

  if (request.method === 'POST' && pathname === '/api/users') {
    const body = await readJson(request);
    const clientLocation = clientLocationFromRequest(request);
    const user = await upsertUser({
      id: body.id || body.userId,
      email: body.email,
      name: body.name,
      creemCustomerId: body.creemCustomerId || body.creem_customer_id,
      lastIp: clientLocation.last_ip,
      lastCountry: clientLocation.last_country,
      metadata: body.metadata || {}
    });
    return jsonResponse(request, 201, { user });
  }

  if (request.method === 'POST' && pathname === '/api/creem/checkout') {
    const body = await readJson(request);
    return jsonResponse(request, 201, await createCreemCheckout(body));
  }

  if (request.method === 'POST' && pathname === '/api/creem/webhook') {
    const rawBody = await readRawBody(request);
    return jsonResponse(request, 200, await handleCreemWebhook(rawBody, request.headers));
  }

  if (request.method === 'GET') {
    const file = await staticResponse(request, pathname);
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
