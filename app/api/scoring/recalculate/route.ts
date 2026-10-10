// app/api/scoring/recalculate/route.ts
import type { NextRequest } from 'next/server';
import { dbError, enforceRateLimit, ok, readJson, unwrap, withAuth } from '@/lib/api';
import { allowOnly, asObject, parseWeights } from '@/lib/validate';
import { DEFAULT_WEIGHTS, type Weights } from '@/types/compass';

// POST /api/scoring/recalculate
// Optional body: { "weights": { monetisasi, engineering, infrastruktur, skill_fit, strategic } }
// Saving weights fires the DB trigger; the RPC then forces a full recompute either way.
// Returns { updated: <projects recalculated>, weights: <weights now in effect> }.
export async function POST(request: NextRequest): Promise<Response> {
  return withAuth(async (ctx) => {
    const { supabase, userId } = ctx;
    await enforceRateLimit(ctx, 'recalculate', 10, 60);

    const body = asObject(await readJson(request, true));
    allowOnly(body, ['weights']);
    if (body.weights !== undefined) {
      const w = parseWeights(body.weights);
      unwrap(
        await supabase
          .from('scoring_weights')
          .upsert(
            {
              user_id: userId,
              weight_monetisasi: w.monetisasi,
              weight_engineering: w.engineering,
              weight_infrastruktur: w.infrastruktur,
              weight_skill_fit: w.skill_fit,
              weight_strategic: w.strategic,
            },
            { onConflict: 'user_id' },
          )
          .select()
          .single(),
      );
    }

    const updated = unwrap(await supabase.rpc('compass_recalc_user', { p_user_id: userId }));

    const { data, error } = await supabase
      .from('scoring_weights')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw dbError(error);
    const weights: Weights =
      data === null
        ? DEFAULT_WEIGHTS
        : {
            monetisasi: data.weight_monetisasi,
            engineering: data.weight_engineering,
            infrastruktur: data.weight_infrastruktur,
            skill_fit: data.weight_skill_fit,
            strategic: data.weight_strategic,
          };
    return ok({ updated, weights });
  });
}
