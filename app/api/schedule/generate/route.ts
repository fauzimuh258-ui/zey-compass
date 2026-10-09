// app/api/schedule/generate/route.ts
// [NEW, Part 5] Deferred out of Part 3's scope. Read-only: returns a
// proposed schedule, apply it with the existing PUT /api/schedule.
import type { NextRequest } from 'next/server';
import { ok, readJson, withAuth } from '@/lib/api';
import { generateSchedule } from '@/lib/ai/schedule';
import { todayInAppTimezone } from '@/lib/dates';
import { allowOnly, asObject, bad, optInt, optText, requireDate } from '@/lib/validate';

export const maxDuration = 30;

const FIELDS = ['date', 'available_hours', 'energy_pattern'] as const;

// POST /api/schedule/generate { date?, available_hours, energy_pattern }
export async function POST(request: NextRequest): Promise<Response> {
  return withAuth(async (ctx) => {
    const o = asObject(await readJson(request));
    allowOnly(o, FIELDS);

    const date = o.date === undefined ? todayInAppTimezone() : requireDate(o.date, 'date');
    const availableHours = optInt(o, 'available_hours', 1, 16);
    if (availableHours === undefined) return bad('available_hours', 'is required (1-16)');
    const energyPattern = optText(o, 'energy_pattern', 200, 1);
    if (energyPattern === undefined) return bad('energy_pattern', 'is required');

    const result = await generateSchedule(ctx, { date, availableHours, energyPattern });
    return ok(result);
  });
}
