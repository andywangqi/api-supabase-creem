import { config } from './config.js';
import { detectLimitForPlan, FREE_DETECT_LIMIT } from './products.js';
import { getActiveSubscription } from './subscriptions.js';
import { rpc } from './supabase.js';
import { localDayBounds } from './time.js';

function usageDate() {
  return localDayBounds(new Date(), config.timezoneOffsetMinutes).localDate;
}

export async function detectAllowanceForUser(user) {
  const subscription = await getActiveSubscription(user.id);
  const plan = subscription?.planKey || 'free';
  const limit = subscription ? detectLimitForPlan(subscription.planKey) : FREE_DETECT_LIMIT;
  const rows = await rpc('increment_usage_limit', {
    p_user_id: user.id || null,
    p_anonymous_id: user.anonymous_id || null,
    p_action: 'face_detect',
    p_usage_date: usageDate(),
    p_limit: limit
  });
  const result = Array.isArray(rows) ? rows[0] || {} : rows || {};

  return {
    allowed: Boolean(result.allowed),
    plan,
    limit: Number(result.limit_value || limit),
    used: Number(result.used || 0),
    remaining: Number(result.remaining || 0)
  };
}
