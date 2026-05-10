import { config, creemBaseUrl } from './config.js';
import { adjustUserCredits } from './credits.js';
import { getPlan, findPlanByProductId, monthlyCreditsForPlan, PLANS } from './products.js';
import { ensureReportOwnedByUser, grantReportEntitlement } from './reports.js';
import { upsertUserSubscription, updateSubscriptionByCreemId } from './subscriptions.js';
import { AppError, findUserByAnonymousId, findUserByEmail, firstRow, supabaseFetch, updateUserById } from './supabase.js';

function pickString(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    return String(value);
  }
  return '';
}

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === 'number') return new Date(value > 9999999999 ? value : value * 1000).toISOString();
  const text = String(value);
  if (/^\d+$/.test(text)) {
    const number = Number(text);
    return new Date(number > 9999999999 ? number : number * 1000).toISOString();
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function createSiteCheckout(user, input = {}) {
  const plan = getPlan(input.planKey || input.plan_key);
  if (!config.creemApiKey) throw new AppError('Missing CREEM_API_KEY', 500);
  if (plan.unlockReport && !(input.reportId || input.report_id)) {
    throw new AppError('reportId is required for full_report checkout', 400);
  }

  const reportId = input.reportId || input.report_id || '';
  if (reportId) await ensureReportOwnedByUser(user, reportId);

  if (input.email && !user.email) {
    user = await updateUserById(user.id, {
      email: String(input.email).toLowerCase(),
      is_anonymous: false,
      ...(input.name ? { name: input.name } : {})
    });
  }

  const metadata = {
    planKey: plan.planKey,
    reportId,
    userId: user.id,
    anonymousId: user.anonymous_id || '',
    email: input.email || user.email || ''
  };

  const body = {
    product_id: plan.productId,
    request_id: `${plan.planKey}:${user.id}:${Date.now()}`,
    success_url: input.successUrl || input.success_url || `${config.appBaseUrl}/payment-success`,
    metadata
  };

  const customerEmail = input.email || user.email;
  if (customerEmail) {
    body.customer = {
      email: String(customerEmail).toLowerCase(),
      ...(input.name || user.name ? { name: input.name || user.name } : {})
    };
  }

  const response = await fetch(`${creemBaseUrl()}/v1/checkouts`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.creemApiKey
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new AppError('Creem checkout creation failed', response.status, payload);

  return {
    checkoutId: payload.id,
    checkoutUrl: payload.checkout_url || payload.url || payload.redirect_url,
    planKey: plan.planKey,
    requestId: body.request_id
  };
}

async function findUserById(userId) {
  if (!userId) return null;
  const rows = await supabaseFetch(`/app_users?id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);
  return firstRow(rows);
}

async function resolvePaymentUser({ metadata = {}, email }) {
  const userId = metadata.userId || metadata.user_id;
  const anonymousId = metadata.anonymousId || metadata.anonymous_id;
  return (
    await findUserById(userId) ||
    await findUserByAnonymousId(anonymousId) ||
    await findUserByEmail(email)
  );
}

function subscriptionPeriodFrom(event, payment) {
  const object = event.object || event.data?.object || event.data || {};
  return {
    start: normalizeDate(
      object.current_period_start ||
      object.period_start ||
      object.last_transaction_date ||
      payment.paid_at ||
      event.created_at
    ),
    end: normalizeDate(object.current_period_end || object.period_end || object.next_transaction_date)
  };
}

export async function applyPaymentBenefits({ payment, mapped, rawEvent }) {
  const metadata = mapped.metadata || {};
  const planKey = metadata.planKey || metadata.plan_key || findPlanByProductId(payment.product_id)?.planKey;
  const plan = PLANS[planKey];
  if (!plan) return;
  const user = await resolvePaymentUser({ metadata, email: payment.email });
  if (!user) throw new AppError('Payment user not found for benefit grant', 400);

  if (plan.planKey === 'full_report') {
    await grantReportEntitlement({
      userId: user.id,
      reportId: metadata.reportId || metadata.report_id,
      paymentId: payment.id,
      metadata
    });
    if (plan.credits) {
      await adjustUserCredits({
        userId: user.id,
        amount: plan.credits,
        action: 'add',
        source: 'full_report_bonus',
        reason: 'Full report bonus credits',
        idempotencyKey: `payment:${payment.id}:full_report_bonus`
      });
    }
    return;
  }

  if (plan.type === 'one_time' && plan.credits) {
    await adjustUserCredits({
      userId: user.id,
      amount: plan.credits,
      action: 'add',
      source: 'credits_pack',
      reason: plan.planKey,
      idempotencyKey: `payment:${payment.id}:credits_pack`
    });
    return;
  }

  if (plan.type === 'subscription') {
    const period = subscriptionPeriodFrom(rawEvent, payment);
    const subscriptionId = pickString(payment.creem_subscription_id, metadata.subscriptionId, metadata.subscription_id);
    if (!subscriptionId) return;

    await upsertUserSubscription({
      userId: user.id,
      creemSubscriptionId: subscriptionId,
      planKey: plan.planKey,
      status: 'active',
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      cancelAtPeriodEnd: false,
      rawEvent
    });

    const monthlyCredits = monthlyCreditsForPlan(plan.planKey);
    if (monthlyCredits) {
      await adjustUserCredits({
        userId: user.id,
        amount: monthlyCredits,
        action: 'add',
        source: 'subscription_monthly',
        reason: plan.planKey,
        idempotencyKey: `subscription:${subscriptionId}:${period.start || payment.paid_at}:credits`
      });
    }
  }
}

export async function applySubscriptionStatus(rawEvent, mapped) {
  const type = mapped.eventType || '';
  const object = rawEvent.object || rawEvent.data?.object || rawEvent.data || {};
  const subscriptionId = pickString(object.id, object.subscription_id, object.subscription?.id);
  if (!subscriptionId) return;

  if (type === 'subscription.canceled') {
    await updateSubscriptionByCreemId(subscriptionId, {
      cancel_at_period_end: true,
      raw_event: rawEvent
    });
  }

  if (['subscription.expired', 'subscription.paused'].includes(type)) {
    await updateSubscriptionByCreemId(subscriptionId, {
      status: type.replace('subscription.', ''),
      raw_event: rawEvent
    });
  }

  if (['payment.failed', 'subscription.payment_failed'].includes(type)) {
    await updateSubscriptionByCreemId(subscriptionId, {
      status: 'past_due',
      raw_event: rawEvent
    });
  }
}
