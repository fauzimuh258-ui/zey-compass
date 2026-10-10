// app/api/ai/analyze/route.ts
import type { NextRequest } from 'next/server';
import { ok, readJson, withAuth } from '@/lib/api';
import { analyzeProject, parseAnalyzeInput } from '@/lib/ai/scoring';

export const maxDuration = 30;

// POST /api/ai/analyze
// Body: { "project_id": "<uuid>" } to re-score a saved project, and/or draft fields
// { name, description?, category?, tech_stack?, deploy_location? } (they override the
// saved project). Read-only: nothing is saved. Apply the result with PATCH /api/projects/:id.
// Returns { suggestion, composite_preview, weights, current, model }.
export async function POST(request: NextRequest): Promise<Response> {
  return withAuth(async (ctx) => {
    const input = parseAnalyzeInput(await readJson(request));
    return ok(await analyzeProject(ctx, input));
  });
}
