// app/api/insights/route.ts
import type { NextRequest } from 'next/server';
import { ok, unwrap, withAuth } from '@/lib/api';
import { intParam, listParam } from '@/lib/validate';
import { INSIGHT_TYPES } from '@/types/compass';

// GET /api/insights?type=weekly_review,skill_gap&limit=20 -> newest first.
// Rows are written by the AI engine in Part 3; this route is read-only.
export async function GET(request: NextRequest): Promise<Response> {
  return withAuth(async ({ supabase }) => {
    const sp = request.nextUrl.searchParams;
    const limit = intParam(sp, 'limit', 20, 1, 100);
    const types = listParam(sp, 'type', INSIGHT_TYPES);

    let query = supabase.from('insights').select('*');
    if (types.length > 0) query = query.in('type', types);
    const rows = unwrap(await query.order('created_at', { ascending: false }).limit(limit));
    return ok(rows);
  });
}
