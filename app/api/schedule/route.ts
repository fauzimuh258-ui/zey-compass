// app/api/schedule/route.ts
import type { NextRequest } from 'next/server';
import { ApiError, dbError, ok, readJson, unwrap, withAuth } from '@/lib/api';
import { todayInAppTimezone } from '@/lib/dates';
import { allowOnly, asObject, parseBlocks, requireDate } from '@/lib/validate';
import type { Json, Schedule, ScheduleBlock, ScheduleRow } from '@/types/compass';

function isBlock(v: Json): v is ScheduleBlock {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    typeof v.time === 'string' &&
    typeof v.duration_min === 'number' &&
    typeof v.task === 'string'
  );
}

function toSchedule(row: ScheduleRow): Schedule {
  return { ...row, blocks: Array.isArray(row.blocks) ? row.blocks.filter(isBlock) : [] };
}

// GET /api/schedule                     -> today (data is null when nothing is planned)
// GET /api/schedule?date=2026-09-21     -> one day
// GET /api/schedule?from=...&to=...     -> range, max 31 days
export async function GET(request: NextRequest): Promise<Response> {
  return withAuth(async ({ supabase }) => {
    const sp = request.nextUrl.searchParams;
    const from = sp.get('from');
    const to = sp.get('to');

    if (from !== null || to !== null) {
      const start = requireDate(from, 'from');
      const end = requireDate(to, 'to');
      const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
      if (days < 0 || days > 31) {
        throw new ApiError(422, 'validation_error', 'range must be between 0 and 31 days');
      }
      const rows = unwrap(
        await supabase
          .from('daily_schedule')
          .select('*')
          .gte('date', start)
          .lte('date', end)
          .order('date'),
      );
      return ok(rows.map(toSchedule), { from: start, to: end });
    }

    const date = requireDate(sp.get('date') ?? todayInAppTimezone(), 'date');
    const { data, error } = await supabase
      .from('daily_schedule')
      .select('*')
      .eq('date', date)
      .maybeSingle();
    if (error) throw dbError(error);
    return ok(data === null ? null : toSchedule(data), { date });
  });
}

// PUT /api/schedule { date, blocks } -> manual edit; upserts the day, ai_generated = false
export async function PUT(request: NextRequest): Promise<Response> {
  return withAuth(async ({ supabase, userId }) => {
    const o = asObject(await readJson(request));
    allowOnly(o, ['date', 'blocks']);
    const row = unwrap(
      await supabase
        .from('daily_schedule')
        .upsert(
          {
            user_id: userId,
            date: requireDate(o.date, 'date'),
            blocks: parseBlocks(o.blocks),
            ai_generated: false,
          },
          { onConflict: 'user_id,date' },
        )
        .select()
        .single(),
    );
    return ok(toSchedule(row));
  });
}
