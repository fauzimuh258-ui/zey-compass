// app/api/ai/insights/route.ts
import type { NextRequest } from 'next/server';
import { ApiError, ok, readJson, withAuth } from '@/lib/api';
import { gatherInsightData, generateInsight, type GeneratedInsight } from '@/lib/ai/insights';
import { allowOnly, asObject, bad } from '@/lib/validate';
import { INSIGHT_TYPES, type InsightType } from '@/types/compass';

export const maxDuration = 30;

type Outcome =
  | { type: InsightType; status: 'ok'; insight: GeneratedInsight }
  | { type: InsightType; status: 'error'; error: { code: string; message: string } };

function parseTypes(raw: unknown): InsightType[] {
  if (raw === undefined) return [...INSIGHT_TYPES];
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > INSIGHT_TYPES.length) {
    return bad('types', 'must be a non-empty array of insight types');
  }
  const out: InsightType[] = [];
  for (const item of raw as unknown[]) {
    const hit = INSIGHT_TYPES.find((t) => t === item);
    if (hit === undefined) return bad('types', `allowed: ${INSIGHT_TYPES.join(', ')}`);
    if (!out.includes(hit)) out.push(hit);
  }
  return out;
}

function describe(err: unknown): { code: string; message: string } {
  if (err instanceof ApiError) return { code: err.code, message: err.message };
  console.error('[ai] insight failed', err instanceof Error ? err.name : 'unknown');
  return { code: 'internal_error', message: 'Unexpected error' };
}

// POST /api/ai/insights   Body (optional): { "types": ["weekly_review", "project_recommendation", "skill_gap"] }
// Generates each type in parallel and stores it in `insights`. Every type reports its own
// status, so one failure does not lose the others. All types failing returns that error.
export async function POST(request: NextRequest): Promise<Response> {
  return withAuth(async (ctx) => {
    const body = asObject(await readJson(request, true));
    allowOnly(body, ['types']);
    const types = parseTypes(body.types);

    const data = await gatherInsightData(ctx);
    const causes = new Map<InsightType, unknown>();
    const results = await Promise.all(
      types.map(async (type): Promise<Outcome> => {
        try {
          return { type, status: 'ok', insight: await generateInsight(ctx, type, data) };
        } catch (err) {
          causes.set(type, err);
          return { type, status: 'error', error: describe(err) };
        }
      }),
    );

    const [first] = types;
    if (first !== undefined && causes.size === types.length) throw causes.get(first); // first requested type wins
    return ok(results, undefined, 201);
  });
}
