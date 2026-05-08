import { config } from './config.js';
import { rpc } from './supabase.js';
import { localDayBounds } from './time.js';

function toNumber(value) {
  return Number(value || 0);
}

export async function getAdminMetrics(days = 30) {
  const safeDays = Math.min(Math.max(Number(days || 30), 1), 120);
  const bounds = localDayBounds();

  const metricsRows = await rpc('get_admin_metrics', {
    p_day_start: bounds.start,
    p_day_end: bounds.end
  });

  const dailyRows = await rpc('get_daily_revenue', {
    p_days: safeDays,
    p_offset_minutes: config.timezoneOffsetMinutes
  });

  const metrics = Array.isArray(metricsRows) ? metricsRows[0] || {} : metricsRows || {};
  const dailyRevenue = Array.isArray(dailyRows) ? dailyRows : [];

  return {
    metrics: {
      totalUsers: toNumber(metrics.total_users),
      todayUsers: toNumber(metrics.today_users),
      todayRevenue: toNumber(metrics.today_revenue),
      totalRevenue: toNumber(metrics.total_revenue),
      currency: config.defaultCurrency,
      localDate: bounds.localDate,
      updatedAt: new Date().toISOString()
    },
    dailyRevenue: dailyRevenue.map((row) => ({
      date: row.day,
      revenue: toNumber(row.revenue),
      paymentsCount: toNumber(row.payments_count)
    }))
  };
}
