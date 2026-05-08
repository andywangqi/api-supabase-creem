import { config } from './config.js';

export function localDayBounds(now = new Date(), offsetMinutes = config.timezoneOffsetMinutes) {
  const offsetMs = offsetMinutes * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const startUtc = new Date(startLocal - offsetMs);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  return {
    start: startUtc.toISOString(),
    end: endUtc.toISOString(),
    localDate: new Date(startLocal).toISOString().slice(0, 10)
  };
}
