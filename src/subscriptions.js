import { detectLimitForPlan } from './products.js';
import { firstRow, supabaseFetch } from './supabase.js';

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function activeStatus(status) {
  return ['active', 'trialing'].includes(String(status || '').toLowerCase());
}

export async function getActiveSubscription(userId) {
  if (!userId) return null;
  const rows = await supabaseFetch(
    `/user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&status=in.(active,trialing)&select=*&order=current_period_end.desc&limit=1`
  );
  const subscription = firstRow(rows);
  if (!subscription) return null;

  if (subscription.current_period_end && new Date(subscription.current_period_end) < new Date()) {
    return null;
  }

  return {
    id: subscription.id,
    userId: subscription.user_id,
    creemSubscriptionId: subscription.creem_subscription_id,
    planKey: subscription.plan_key,
    status: subscription.status,
    active: true,
    detectLimit: detectLimitForPlan(subscription.plan_key),
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end)
  };
}

export async function upsertUserSubscription({
  userId,
  creemSubscriptionId,
  planKey,
  status = 'active',
  currentPeriodStart,
  currentPeriodEnd,
  cancelAtPeriodEnd = false,
  rawEvent = {}
}) {
  const rows = await supabaseFetch('/user_subscriptions?on_conflict=creem_subscription_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      user_id: userId,
      creem_subscription_id: creemSubscriptionId,
      plan_key: planKey,
      status,
      current_period_start: normalizeDate(currentPeriodStart),
      current_period_end: normalizeDate(currentPeriodEnd),
      cancel_at_period_end: Boolean(cancelAtPeriodEnd),
      raw_event: rawEvent
    }
  });

  return firstRow(rows);
}

export async function updateSubscriptionByCreemId(creemSubscriptionId, patch) {
  if (!creemSubscriptionId) return null;
  const rows = await supabaseFetch(`/user_subscriptions?creem_subscription_id=eq.${encodeURIComponent(creemSubscriptionId)}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: patch
  });
  return firstRow(rows);
}
