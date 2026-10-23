// lib/schedule-dates.ts
// Pure date helpers for the Schedule screen. Previously lived as named
// exports inside app/(dashboard)/schedule/page.tsx for easy unit testing,
// but Next.js's "page" type only allows a default export (plus a short
// allow-list like `metadata`) - any other named export fails the build
// with "X is not a valid Page export field". Moved here instead.
import type { ScheduleBlock } from '@/types/compass';

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday..Sunday range containing `date` (plain UTC date math, no timezone library). */
export function weekRange(date: string): { from: string; to: string } {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const from = addDays(date, diffToMonday);
  return { from, to: addDays(from, 6) };
}

export function weekDates(from: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(from, i));
}

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function dayLabel(date: string): string {
  return DAY_LABELS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';
}

export function plannedMinutes(blocks: ScheduleBlock[]): number {
  return blocks.reduce((sum, b) => sum + b.duration_min, 0);
}
