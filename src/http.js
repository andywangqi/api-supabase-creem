import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

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

export function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  res.end(body);
}

export function sendError(res, statusCode, message, details) {
  sendJson(res, statusCode, {
    error: {
      message,
      ...(details ? { details } : {})
    }
  });
}

export function redirect(res, location, statusCode = 302) {
  res.writeHead(statusCode, { location });
  res.end();
}

export async function readRawBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export async function readJson(req) {
  const raw = await readRawBody(req);
  if (!raw.length) return {};

  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON body');
    error.statusCode = 400;
    throw error;
  }
}

export function serveStatic(res, publicDir, requestPath) {
  const cleanPath = requestPath === '/' ? '/admin.html' : requestPath;
  const decodedPath = decodeURIComponent(cleanPath.split('?')[0]);
  const safePath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = resolve(join(publicDir, safePath));
  const publicRoot = resolve(publicDir);

  if (!filePath.startsWith(publicRoot) || !existsSync(filePath)) {
    return false;
  }

  const ext = extname(filePath);
  res.writeHead(200, {
    'content-type': mimeTypes.get(ext) || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=3600'
  });
  createReadStream(filePath).pipe(res);
  return true;
}
