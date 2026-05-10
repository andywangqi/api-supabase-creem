import { AI_CREDIT_COSTS } from './products.js';
import { adjustUserCredits } from './credits.js';
import { ensureReportOwnedByUser, reportAccess } from './reports.js';
import { AppError, firstRow, supabaseFetch } from './supabase.js';

function generationCost(type) {
  const cost = AI_CREDIT_COSTS[type];
  if (!cost) throw new AppError('Invalid AI generation type', 400);
  return cost;
}

function toPublicGeneration(row, creditsBalance) {
  return {
    id: row.id,
    reportId: row.report_id,
    type: row.type,
    styleId: row.style_id || null,
    creditsCost: Number(row.credits_cost || 0),
    status: row.status,
    resultUrl: row.result_url || null,
    errorMessage: row.error_message || null,
    creditsBalance,
    createdAt: row.created_at
  };
}

export async function createTryOnGeneration(user, input = {}) {
  const reportId = input.reportId || input.report_id;
  const type = String(input.type || '').trim();
  const styleId = input.styleId || input.style_id || null;
  if (!reportId) throw new AppError('reportId is required', 400);

  await ensureReportOwnedByUser(user, reportId);
  const access = await reportAccess(user, reportId);
  if (!access.unlocked) throw new AppError('Full report access is required', 403);

  const cost = generationCost(type);
  const rows = await supabaseFetch('/ai_generations', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      user_id: user.id,
      report_id: reportId,
      type,
      style_id: styleId,
      credits_cost: cost,
      status: 'pending',
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {}
    }
  });
  const generation = firstRow(rows);

  const credits = await adjustUserCredits({
    userId: user.id,
    amount: cost,
    action: 'deduct',
    source: 'ai_try_on',
    reason: `${type}:${styleId || 'default'}`,
    idempotencyKey: `generation:${generation.id}:cost`
  });

  const updatedRows = await supabaseFetch(`/ai_generations?id=eq.${encodeURIComponent(generation.id)}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: {
      status: input.resultUrl || input.result_url ? 'completed' : 'pending',
      result_url: input.resultUrl || input.result_url || null
    }
  });

  return toPublicGeneration(firstRow(updatedRows), credits.creditsBalance);
}
