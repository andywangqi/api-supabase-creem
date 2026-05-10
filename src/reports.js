import { AppError, firstRow, supabaseFetch } from './supabase.js';
import { getActiveSubscription } from './subscriptions.js';

function jsonObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeReportInput(input = {}) {
  const faceShape = String(input.faceShape || input.face_shape || '').trim();
  if (!faceShape) throw new AppError('faceShape is required', 400);

  return {
    face_shape: faceShape,
    confidence: input.confidence == null ? null : Number(input.confidence),
    scores: jsonObject(input.scores),
    characteristics: jsonObject(input.characteristics),
    free_result: jsonObject(input.freeResult || input.free_result),
    full_result: jsonObject(input.fullResult || input.full_result),
    image_url: input.imageUrl || input.image_url || null,
    metadata: jsonObject(input.metadata)
  };
}

export function toPublicReport(row, access = { unlocked: false, source: null }) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || null,
    anonymousId: row.anonymous_id || null,
    faceShape: row.face_shape,
    confidence: row.confidence == null ? null : Number(row.confidence),
    scores: row.scores || {},
    characteristics: row.characteristics || {},
    freeResult: row.free_result || {},
    fullResult: access.unlocked ? row.full_result || {} : null,
    imageUrl: row.image_url || null,
    unlocked: Boolean(access.unlocked),
    unlockSource: access.source || null,
    createdAt: row.created_at
  };
}

export async function createFaceReport(user, input) {
  const rows = await supabaseFetch('/face_reports', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      ...normalizeReportInput(input),
      user_id: user.id || null,
      anonymous_id: user.anonymous_id || null
    }
  });

  return toPublicReport(firstRow(rows), { unlocked: false, source: null });
}

async function getRawReport(id) {
  const rows = await supabaseFetch(`/face_reports?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return firstRow(rows);
}

function ownsReport(user, report) {
  return Boolean(
    report &&
    (
      (user.id && report.user_id === user.id) ||
      (user.anonymous_id && report.anonymous_id === user.anonymous_id)
    )
  );
}

export async function hasReportEntitlement(userId, reportId) {
  if (!userId || !reportId) return false;
  const rows = await supabaseFetch(
    `/user_entitlements?user_id=eq.${encodeURIComponent(userId)}&report_id=eq.${encodeURIComponent(reportId)}&type=eq.full_report&select=id,expires_at&limit=1`
  );
  const entitlement = firstRow(rows);
  if (!entitlement) return false;
  return !entitlement.expires_at || new Date(entitlement.expires_at) > new Date();
}

export async function reportAccess(user, reportId) {
  const subscription = await getActiveSubscription(user.id);
  if (subscription) {
    return {
      unlocked: true,
      source: 'subscription',
      subscription
    };
  }

  const entitled = await hasReportEntitlement(user.id, reportId);
  return {
    unlocked: entitled,
    source: entitled ? 'entitlement' : null,
    subscription: null
  };
}

export async function getFaceReportForUser(user, reportId) {
  const report = await getRawReport(reportId);
  if (!report || !ownsReport(user, report)) throw new AppError('Report not found', 404);
  return toPublicReport(report, await reportAccess(user, reportId));
}

export async function grantReportEntitlement({ userId, reportId, paymentId, metadata = {} }) {
  if (!userId || !reportId) return null;
  const rows = await supabaseFetch('/user_entitlements?on_conflict=user_id,report_id,type', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      user_id: userId,
      report_id: reportId,
      type: 'full_report',
      source_payment_id: paymentId || null,
      metadata
    }
  });
  return firstRow(rows);
}

export async function ensureReportOwnedByUser(user, reportId) {
  const report = await getRawReport(reportId);
  if (!report || !ownsReport(user, report)) throw new AppError('Report not found', 404);
  return report;
}
