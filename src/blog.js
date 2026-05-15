import { config } from './config.js';
import { AppError, firstRow, supabaseFetch } from './supabase.js';

const VALID_STATUSES = new Set(['draft', 'published']);

function nowIso() {
  return new Date().toISOString();
}

function clampLimit(value, fallback = 20) {
  const number = Number(value || fallback);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), 1), 100);
}

function clampOffset(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(Math.trunc(number), 0);
}

export function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function normalizeStatus(value) {
  const status = String(value || 'draft').toLowerCase();
  if (!VALID_STATUSES.has(status)) {
    throw new AppError('Invalid blog status', 400);
  }
  return status;
}

function normalizeBlogInput(input = {}, isUpdate = false) {
  const title = String(input.title || '').trim();
  const content = String(input.content || '').trim();
  const status = normalizeStatus(input.status);
  const slug = slugify(input.slug || title);

  if (!isUpdate && !title) throw new AppError('Blog title is required', 400);
  if (!isUpdate && !content) throw new AppError('Blog content is required', 400);
  if (!isUpdate && !slug) throw new AppError('Blog slug is required', 400);

  const payload = {
    ...(title ? { title } : {}),
    ...(slug ? { slug } : {}),
    ...(input.excerpt != null ? { excerpt: String(input.excerpt).trim() || null } : {}),
    ...(content ? { content } : {}),
    ...(input.coverImageUrl != null || input.cover_image_url != null
      ? { cover_image_url: String(input.coverImageUrl || input.cover_image_url || '').trim() || null }
      : {}),
    ...(input.authorName != null || input.author_name != null
      ? { author_name: String(input.authorName || input.author_name || '').trim() || null }
      : {}),
    status,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {}
  };

  if (status === 'published') {
    payload.published_at = input.publishedAt || input.published_at || nowIso();
  } else if (input.publishedAt === null || input.published_at === null || !isUpdate) {
    payload.published_at = null;
  }

  return payload;
}

function absoluteUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;

  const base = siteBaseUrl();
  const path = text.startsWith('/') ? text : `/${text}`;
  return `${base}${path}`;
}

function siteBaseUrl() {
  return config.appBaseUrl.replace(/\/$/, '');
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== '')
  );
}

export function toBlogPostingSchema(row) {
  if (!row) return null;

  const title = row.title || '';
  const description = row.excerpt || title;
  const image = absoluteUrl(row.cover_image_url);
  const authorName = row.author_name || 'Face Shape Detector';

  return compactObject({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    datePublished: row.published_at || row.created_at,
    dateModified: row.updated_at || row.published_at || row.created_at,
    image: image || null,
    author: {
      '@type': 'Person',
      name: authorName
    },
    publisher: {
      '@type': 'Organization',
      name: 'Face Shape Detector',
      url: siteBaseUrl()
    }
  });
}

function toPublicBlog(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt || null,
    content: row.content,
    coverImageUrl: row.cover_image_url || null,
    authorName: row.author_name || null,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schema: toBlogPostingSchema(row)
  };
}

function mapRows(rows) {
  return Array.isArray(rows) ? rows.map(toPublicBlog) : [];
}

async function findBlogBySlug(slug) {
  if (!slug) return null;
  const rows = await supabaseFetch(
    `/blog_posts?slug=eq.${encodeURIComponent(slug)}&select=id,slug&limit=1`
  );
  return firstRow(rows);
}

async function uniqueCreateSlug(slug) {
  const base = slugify(slug);
  if (!base) throw new AppError('Blog slug is required', 400);

  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? base : slugify(`${base}-${index + 1}`);
    const existing = await findBlogBySlug(candidate);
    if (!existing) return candidate;
  }

  throw new AppError('Blog slug already exists', 409);
}

export async function createBlogPost(input) {
  const payload = normalizeBlogInput(input);
  payload.slug = await uniqueCreateSlug(payload.slug);

  const rows = await supabaseFetch('/blog_posts', {
    method: 'POST',
    prefer: 'return=representation',
    body: payload
  });
  return toPublicBlog(firstRow(rows));
}

export async function updateBlogPost(id, input) {
  if (!id) throw new AppError('Blog id is required', 400);

  const payload = normalizeBlogInput(input, true);
  const rows = await supabaseFetch(`/blog_posts?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: payload
  });

  const blog = firstRow(rows);
  if (!blog) throw new AppError('Blog post not found', 404);
  return toPublicBlog(blog);
}

export async function deleteBlogPost(id) {
  if (!id) throw new AppError('Blog id is required', 400);

  await supabaseFetch(`/blog_posts?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    prefer: 'return=minimal'
  });

  return { ok: true };
}

export async function listAdminBlogPosts({ limit, offset } = {}) {
  const safeLimit = clampLimit(limit, 20);
  const safeOffset = clampOffset(offset);
  const rows = await supabaseFetch(
    `/blog_posts?select=*&order=created_at.desc&limit=${safeLimit}&offset=${safeOffset}`
  );
  return mapRows(rows);
}

export async function listPublishedBlogPosts({ limit, offset } = {}) {
  const safeLimit = clampLimit(limit, 20);
  const safeOffset = clampOffset(offset);
  const rows = await supabaseFetch(
    `/blog_posts?status=eq.published&select=*&order=published_at.desc&limit=${safeLimit}&offset=${safeOffset}`
  );
  return mapRows(rows);
}

export async function getPublishedBlogPost(slug) {
  const cleanSlug = slugify(slug);
  if (!cleanSlug) throw new AppError('Blog slug is required', 400);

  const rows = await supabaseFetch(
    `/blog_posts?slug=eq.${encodeURIComponent(cleanSlug)}&status=eq.published&select=*&limit=1`
  );
  const blog = firstRow(rows);
  if (!blog) throw new AppError('Blog post not found', 404);
  return toPublicBlog(blog);
}
