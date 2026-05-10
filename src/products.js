import { config } from './config.js';
import { AppError } from './supabase.js';

export const PLANS = {
  full_report: {
    planKey: 'full_report',
    type: 'one_time',
    priceCents: 699,
    credits: 20,
    unlockReport: true,
    detectLimit: 3
  },
  credits_50: {
    planKey: 'credits_50',
    type: 'one_time',
    priceCents: 499,
    credits: 50,
    detectLimit: 3
  },
  credits_120: {
    planKey: 'credits_120',
    type: 'one_time',
    priceCents: 999,
    credits: 120,
    detectLimit: 3
  },
  credits_300: {
    planKey: 'credits_300',
    type: 'one_time',
    priceCents: 1999,
    credits: 300,
    detectLimit: 3
  },
  pro_monthly: {
    planKey: 'pro_monthly',
    type: 'subscription',
    priceCents: 999,
    monthlyCredits: 150,
    detectLimit: 50,
    unlockAllReports: true
  },
  studio_monthly: {
    planKey: 'studio_monthly',
    type: 'subscription',
    priceCents: 1999,
    monthlyCredits: 500,
    detectLimit: 200,
    unlockAllReports: true
  }
};

export const FREE_DETECT_LIMIT = 3;

export const AI_CREDIT_COSTS = {
  makeup: 8,
  hairstyle: 10,
  hd: 20
};

export function getPlan(planKey) {
  const plan = PLANS[planKey];
  if (!plan) throw new AppError('Invalid planKey', 400);

  const productId = config.creemProducts[planKey];
  if (!productId) {
    throw new AppError(`Missing Creem product id for ${planKey}`, 500);
  }

  return {
    ...plan,
    productId
  };
}

export function findPlanByProductId(productId) {
  if (!productId) return null;
  const entry = Object.entries(config.creemProducts).find(([, value]) => value === productId);
  return entry ? { ...PLANS[entry[0]], planKey: entry[0], productId } : null;
}

export function detectLimitForPlan(planKey) {
  if (!planKey) return FREE_DETECT_LIMIT;
  return PLANS[planKey]?.detectLimit || FREE_DETECT_LIMIT;
}

export function monthlyCreditsForPlan(planKey) {
  return PLANS[planKey]?.monthlyCredits || 0;
}
