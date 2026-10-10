// lib/dates.ts
// Shared date helpers. APP_TIMEZONE is an IANA name (e.g. "Asia/Jakarta");
// defaults to UTC. Extracted from app/api/schedule/route.ts so the dashboard
// can show "today" using the same definition the schedule API uses.
const DAY_MS = 86_400_000;

function appTimeZone(): string {
  return process.env.APP_TIMEZONE || 'UTC';
}

/** Today as YYYY-MM-DD in APP_TIMEZONE. */
export function todayInAppTimezone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: appTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Whole days between an ISO timestamp and now. Never negative (clock skew). */
export function daysAgo(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS));
}
