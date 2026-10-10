// app/api/projects/route.ts
import type { NextRequest } from 'next/server';
import { ok, readJson, unwrap, withAuth } from '@/lib/api';
import { seal, toProject, toSummary } from '@/lib/projects';
import { enumParam, escapeLike, intParam, listParam, parseProjectCreate } from '@/lib/validate';
import { PROJECT_STATUSES } from '@/types/compass';

const SORT_COLUMNS = {
  composite: 'score_composite',
  monetisasi: 'score_monetisasi',
  engineering: 'score_engineering',
  infrastruktur: 'score_infrastruktur',
  skill_fit: 'score_skill_fit',
  strategic: 'score_strategic',
  updated: 'updated_at',
  created: 'created_at',
  name: 'name',
} as const;
const SORT_KEYS = Object.keys(SORT_COLUMNS) as (keyof typeof SORT_COLUMNS)[];

// GET /api/projects?status=next,in_progress&category=&q=&sort=composite&order=desc&limit=50&offset=0
export async function GET(request: NextRequest): Promise<Response> {
  return withAuth(async ({ supabase }) => {
    const sp = request.nextUrl.searchParams;
    const limit = intParam(sp, 'limit', 50, 1, 200);
    const offset = intParam(sp, 'offset', 0, 0, 100000);
    const sort = enumParam(sp, 'sort', SORT_KEYS, 'composite');
    const ascending = enumParam(sp, 'order', ['asc', 'desc'] as const, 'desc') === 'asc';

    let query = supabase.from('projects').select('*', { count: 'exact' });
    const statuses = listParam(sp, 'status', PROJECT_STATUSES);
    if (statuses.length > 0) query = query.in('status', statuses);
    const category = sp.get('category')?.trim();
    if (category) query = query.eq('category', category);
    const q = sp.get('q')?.trim();
    if (q) query = query.ilike('name', `%${escapeLike(q)}%`);

    const res = await query
      .order(SORT_COLUMNS[sort], { ascending })
      .order('id')
      .range(offset, offset + limit - 1);
    const rows = unwrap(res);
    return ok(rows.map(toSummary), { total: res.count ?? rows.length, limit, offset });
  });
}

// POST /api/projects -> 201 with the created project (composite computed by the DB)
export async function POST(request: NextRequest): Promise<Response> {
  return withAuth(async ({ supabase, userId }) => {
    const input = parseProjectCreate(await readJson(request));
    const row = unwrap(
      await supabase
        .from('projects')
        .insert({ ...seal(input), name: input.name, user_id: userId })
        .select()
        .single(),
    );
    return ok(toProject(row), undefined, 201);
  });
}
