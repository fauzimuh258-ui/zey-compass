// lib/format.ts
// Display formatters for the UI. Labels are Indonesian per the spec
// ("Bahasa Indonesia untuk UI"); code and comments stay in English.
import { daysAgo } from '@/lib/dates';
import type { ProjectStatus } from '@/types/compass';

const STATUS_LABELS: Record<ProjectStatus, string> = {
  backlog: 'Backlog',
  next: 'Berikutnya',
  in_progress: 'Berjalan',
  review: 'Review',
  done: 'Selesai',
};

export function statusLabel(status: ProjectStatus): string {
  return STATUS_LABELS[status];
}

/** [ASSUMPTION] one decimal place for a compact display, e.g. 71.75 -> "71.8". */
export function formatScore(score: number): string {
  return (Math.round(score * 10) / 10).toFixed(1);
}

export function relativeDays(iso: string, now: Date = new Date()): string {
  const days = daysAgo(iso, now);
  if (days === 0) return 'hari ini';
  if (days === 1) return 'kemarin';
  return `${days} hari lalu`;
}

/** 90 -> "1j 30m"; 60 -> "1j"; 45 -> "45m". */
export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}j`;
  return `${h}j ${m}m`;
}
