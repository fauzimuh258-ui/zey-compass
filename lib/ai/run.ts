// lib/ai/run.ts
// Guard rails around every AI call: rate limit -> provider call -> query log.
import { ApiError, enforceRateLimit, type AuthContext } from '@/lib/api';
import { completeJson, type AiResult, type JsonRequest } from '@/lib/ai/client';

// [ASSUMPTION] Sized for one user on free tiers: a short burst cap plus an hourly cap.
const AI_LIMITS = [
  { bucket: 'ai_burst', limit: 6, windowSeconds: 60 },
  { bucket: 'ai_hourly', limit: 60, windowSeconds: 3600 },
] as const;

type LogEntry = {
  endpoint: string;
  status: 'ok' | 'error' | 'rate_limited';
  latencyMs: number;
  model?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
};

/** Metadata only, never the prompt or the reply (spec: AI must not log personal data). */
async function logQuery(ctx: AuthContext, entry: LogEntry): Promise<void> {
  try {
    const { error } = await ctx.supabase.from('ai_query_log').insert({
      user_id: ctx.userId,
      endpoint: entry.endpoint,
      status: entry.status,
      latency_ms: entry.latencyMs,
      model: entry.model ?? null,
      input_tokens: entry.inputTokens ?? null,
      output_tokens: entry.outputTokens ?? null,
    });
    if (error) console.error('[ai] query log failed', error.code);
  } catch (err) {
    console.error('[ai] query log failed', err instanceof Error ? err.name : 'unknown');
  }
}

/**
 * The only way the app talks to a model. `endpoint` is a stable label such as
 * "ai/analyze". Logging never blocks or fails the request.
 */
export async function runAi<T>(
  ctx: AuthContext,
  endpoint: string,
  request: JsonRequest<T>,
): Promise<AiResult<T>> {
  const started = Date.now();

  try {
    for (const { bucket, limit, windowSeconds } of AI_LIMITS) {
      await enforceRateLimit(ctx, bucket, limit, windowSeconds);
    }
  } catch (err) {
    if (err instanceof ApiError && err.code === 'rate_limited') {
      await logQuery(ctx, { endpoint, status: 'rate_limited', latencyMs: Date.now() - started });
    }
    throw err;
  }

  try {
    const result = await completeJson(request);
    await logQuery(ctx, {
      endpoint,
      status: 'ok',
      latencyMs: result.latencyMs,
      model: `${result.provider}/${result.model}`,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
    return result;
  } catch (err) {
    await logQuery(ctx, { endpoint, status: 'error', latencyMs: Date.now() - started });
    throw err;
  }
}
