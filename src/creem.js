import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { config, creemBaseUrl, missing } from './config.js';
import { AppError, insertPayment, upsertUser } from './supabase.js';

const PAID_EVENTS = new Set([
  'checkout.completed',
  'order.paid',
  'payment.completed',
  'subscription.paid'
]);

const REFUND_EVENTS = new Set([
  'refund.created',
  'refund.succeeded',
  'order.refunded'
]);

function getHeader(headers, name) {
  if (typeof headers?.get === 'function') {
    return headers.get(name) || '';
  }
  return headers[name] || headers[name.toLowerCase()];
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function normalizeSignature(signature) {
  if (!signature) return [];
  return String(signature)
    .split(',')
    .map((part) => part.trim().replace(/^v\d+=/, ''))
    .filter(Boolean);
}

export function verifyCreemSignature(rawBody, headers) {
  if (!config.creemWebhookSecret) {
    throw new AppError('Missing CREEM_WEBHOOK_SECRET', 500);
  }

  const signature =
    getHeader(headers, 'creem-signature') ||
    getHeader(headers, 'x-creem-signature') ||
    getHeader(headers, 'webhook-signature');

  if (!signature) {
    throw new AppError('Missing Creem signature', 401);
  }

  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
  const expected = createHmac('sha256', config.creemWebhookSecret).update(payload).digest('hex');
  const expectedBase64 = createHmac('sha256', config.creemWebhookSecret).update(payload).digest('base64');

  const candidates = normalizeSignature(signature);
  const valid = candidates.some((candidate) => (
    constantTimeEqual(candidate, expected) || constantTimeEqual(candidate, expectedBase64)
  ));

  if (!valid) {
    throw new AppError('Invalid Creem signature', 401);
  }
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringOrId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value.id || '';
  return String(value);
}

function pickNumber(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return Math.round(number);
  }
  return 0;
}

function pickString(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    return String(value);
  }
  return '';
}

function normalizeDate(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 9999999999 ? value : value * 1000;
    return new Date(ms).toISOString();
  }

  const text = String(value);
  if (/^\d+$/.test(text)) {
    const number = Number(text);
    const ms = number > 9999999999 ? number : number * 1000;
    return new Date(ms).toISOString();
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function extractPayload(event) {
  return objectOrEmpty(event.object || event.data?.object || event.data || event.payload);
}

export function mapCreemEvent(rawEvent) {
  const event = objectOrEmpty(rawEvent);
  const type = pickString(event.type, event.event_type, event.eventType);
  const object = extractPayload(event);
  const metadata = objectOrEmpty(object.metadata || object.custom_fields || event.metadata);
  const order = objectOrEmpty(object.order || event.order);
  const customer = objectOrEmpty(object.customer || order.customer || event.customer);
  const product = objectOrEmpty(object.product || order.product || event.product);
  const subscription = objectOrEmpty(object.subscription || event.subscription);
  const isRefund = REFUND_EVENTS.has(type);
  const isPaid = PAID_EVENTS.has(type);

  if (!isPaid && !isRefund) {
    return { ignored: true, eventType: type || 'unknown' };
  }

  if (type === 'checkout.completed' && object.subscription) {
    return { ignored: true, eventType: type, reason: 'subscription revenue is tracked by subscription.paid' };
  }

  const eventId = pickString(event.id, event.event_id, object.event_id, order.event_id);
  if (!eventId) {
    throw new AppError('Creem event id is required for idempotency', 400);
  }

  const customerEmail = pickString(
    customer.email,
    object.customer_email,
    object.email,
    order.customer_email,
    metadata.email
  ).toLowerCase();

  const amount = pickNumber(
    object.amount_paid,
    order.amount_paid,
    object.amount,
    order.amount,
    object.total,
    order.total,
    object.total_amount,
    order.total_amount,
    product.price
  );

  const signedAmount = isRefund ? -Math.abs(amount) : Math.abs(amount);
  const userId = pickString(metadata.userId, metadata.user_id, object.user_id, order.user_id);
  const paidAt = normalizeDate(
    object.paid_at ||
    order.paid_at ||
    object.last_transaction_date ||
    object.created_at ||
    order.created_at ||
    event.created_at
  );

  return {
    ignored: false,
    user: customerEmail ? {
      id: userId || undefined,
      email: customerEmail,
      name: pickString(customer.name, metadata.name),
      creemCustomerId: stringOrId(object.customer || order.customer),
      metadata: { source: 'creem_webhook' }
    } : null,
    payment: {
      user_id: userId || null,
      email: customerEmail || null,
      creem_event_id: eventId,
      creem_checkout_id: pickString(object.checkout_id, order.checkout_id, stringOrId(object.checkout)),
      creem_order_id: pickString(object.order_id, stringOrId(object.order), order.id),
      creem_subscription_id: pickString(object.subscription_id, subscription.id, stringOrId(object.subscription)),
      creem_transaction_id: pickString(object.last_transaction_id, order.transaction_id, object.transaction_id),
      creem_customer_id: pickString(stringOrId(object.customer), stringOrId(order.customer), customer.id),
      request_id: pickString(object.request_id, order.request_id, metadata.requestId, metadata.request_id),
      product_id: pickString(object.product_id, order.product_id, product.id, stringOrId(object.product)),
      product_name: pickString(product.name, object.product_name, order.product_name),
      amount: signedAmount,
      currency: pickString(object.currency, order.currency, config.defaultCurrency).toUpperCase(),
      status: isRefund ? 'refunded' : 'completed',
      paid_at: paidAt || new Date().toISOString(),
      event_type: type,
      raw_event: event
    }
  };
}

export async function createCreemCheckout(input = {}) {
  const miss = missing(['creemApiKey']);
  if (miss.length) {
    throw new AppError(`Missing Creem config: ${miss.join(', ')}`, 500);
  }

  const productId = input.productId || input.product_id || config.creemProductId;
  if (!productId) {
    throw new AppError('productId or CREEM_PRODUCT_ID is required', 400);
  }

  let user = null;
  if (input.email) {
    user = await upsertUser({
      id: input.userId,
      email: input.email,
      name: input.name,
      metadata: { source: 'checkout' }
    });
  }

  const requestId = input.requestId || input.request_id || input.userId || user?.id || randomUUID();
  const successUrl = input.successUrl || input.success_url || `${config.appBaseUrl}/payment-success`;
  const metadata = {
    ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
    requestId,
    userId: input.userId || user?.external_id || '',
    email: input.email || ''
  };

  const body = {
    product_id: productId,
    request_id: requestId,
    success_url: successUrl,
    metadata
  };

  if (input.email) {
    body.customer = {
      email: String(input.email).toLowerCase(),
      ...(input.name ? { name: input.name } : {})
    };
  }

  if (input.units) body.units = Number(input.units);
  if (input.discountCode || input.discount_code) body.discount_code = input.discountCode || input.discount_code;

  const response = await fetch(`${creemBaseUrl()}/v1/checkouts`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.creemApiKey
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError('Creem checkout creation failed', response.status, payload);
  }

  return {
    checkoutId: payload.id,
    checkoutUrl: payload.checkout_url || payload.url || payload.redirect_url,
    requestId,
    raw: payload
  };
}

export async function handleCreemWebhook(rawBody, headers) {
  verifyCreemSignature(rawBody, headers);

  const event = JSON.parse(rawBody.toString('utf8'));
  const mapped = mapCreemEvent(event);
  if (mapped.ignored) {
    return { ok: true, ignored: true, eventType: mapped.eventType };
  }

  let user = null;
  if (mapped.user) {
    user = await upsertUser(mapped.user);
  }

  const payment = {
    ...mapped.payment,
    user_id: mapped.payment.user_id || user?.id || null
  };

  const saved = await insertPayment(payment);
  return { ok: true, paymentId: saved?.id, eventType: payment.event_type };
}
