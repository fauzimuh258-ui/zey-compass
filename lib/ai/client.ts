// lib/ai/client.ts
// Provider layer for Groq and Cloudflare Workers AI. Vanilla fetch, no SDKs.
// Both expose an OpenAI-compatible /chat/completions endpoint, so one code
// path serves both. Providers are tried in AI_PROVIDER_ORDER (default
// "groq,cloudflare"). An unusable answer gets one retry with the reason.
import { ApiError } from '@/lib/api';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type AiProvider = 'groq' | 'cloudflare';

export type JsonRequest<T> = {
  messages: ChatMessage[];
  /** Turns the parsed JSON into T. Reject with outputError() when it does not fit. */
  validate: (raw: unknown) => T;
  temperature: number;
  maxTokens: number;
};

export type AiResult<T> = {
  value: T;
  provider: AiProvider;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
};

/** The model answered, but not with usable JSON. */
export class AiOutputError extends Error {}

export function outputError(message: string): never {
  throw new AiOutputError(message);
}

class ProviderError extends Error {
  readonly provider: AiProvider;
  readonly status: number | null; // null = network error or timeout

  constructor(provider: AiProvider, status: number | null, message: string) {
    super(message);
    this.provider = provider;
    this.status = status;
  }
}

type ProviderConfig = {
  name: AiProvider;
  url: string;
  apiKey: string;
  model: string;
  jsonMode: boolean;
  /** Groq-only. Reasoning models (gpt-oss, qwen3) emit a chain-of-thought
   * alongside the answer; "hidden" returns just the final message. Omit for
   * providers whose OpenAI-compatible endpoint may not recognize the field. */
  reasoningFormat?: 'hidden';
};

// [FIX] llama-3.3-70b-versatile was decommissioned by Groq on 2026-08-16.
// openai/gpt-oss-120b is Groq's recommended replacement (qwen/qwen3.6-27b is
// the other option; override via GROQ_MODEL to use it instead). It is a
// reasoning model, hence reasoningFormat below and the larger maxTokens at
// the runAi() call sites in scoring.ts and insights.ts.
export function configuredProviders(): ProviderConfig[] {
  const groqKey = process.env.GROQ_API_KEY;
  const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const cfToken = process.env.CLOUDFLARE_API_TOKEN;

  const available: Record<AiProvider, ProviderConfig | undefined> = {
    groq: groqKey
      ? {
          name: 'groq',
          url: 'https://api.groq.com/openai/v1/chat/completions',
          apiKey: groqKey,
          model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
          jsonMode: true,
          reasoningFormat: 'hidden',
        }
      : undefined,
    cloudflare:
      cfAccount && cfToken
        ? {
            name: 'cloudflare',
            url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfAccount)}/ai/v1/chat/completions`,
            apiKey: cfToken,
            model: process.env.CLOUDFLARE_AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
            // No response_format here: not every Workers AI model accepts it.
            // The prompt asks for JSON and extractJson() copes with extra text.
            jsonMode: false,
          }
        : undefined,
  };

  const out: ProviderConfig[] = [];
  for (const raw of (process.env.AI_PROVIDER_ORDER || 'groq,cloudflare').split(',')) {
    const name = raw.trim();
    if (name !== 'groq' && name !== 'cloudflare') continue; // ignore typos
    const cfg = available[name];
    if (cfg !== undefined && !out.includes(cfg)) out.push(cfg);
  }
  return out;
}

// ---------- one HTTP call ----------

type Completion = { text: string; inputTokens: number | null; outputTokens: number | null };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const count = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;

function readCompletion(provider: AiProvider, body: unknown): Completion {
  const choice = isRecord(body) && Array.isArray(body.choices) ? (body.choices as unknown[])[0] : undefined;
  const message = isRecord(choice) ? choice.message : undefined;
  const content = isRecord(message) ? message.content : undefined;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new ProviderError(provider, 200, 'empty completion');
  }
  const usage: Record<string, unknown> = isRecord(body) && isRecord(body.usage) ? body.usage : {};
  return {
    text: content,
    inputTokens: count(usage.prompt_tokens),
    outputTokens: count(usage.completion_tokens),
  };
}

async function callProvider(
  p: ProviderConfig,
  messages: ChatMessage[],
  opts: { temperature: number; maxTokens: number; signal: AbortSignal },
): Promise<Completion> {
  let res: Response;
  try {
    res = await fetch(p.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: p.model,
        messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        stream: false,
        ...(p.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        ...(p.reasoningFormat ? { reasoning_format: p.reasoningFormat } : {}),
      }),
      signal: opts.signal,
    });
  } catch {
    throw new ProviderError(p.name, null, 'network error or timeout');
  }
  if (!res.ok) throw new ProviderError(p.name, res.status, `HTTP ${res.status}`);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ProviderError(p.name, res.status, 'response is not JSON');
  }
  return readCompletion(p.name, body);
}

/** Pulls a JSON object out of a reply: plain, fenced, or wrapped in extra text. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const candidate = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(cleaned)?.[1] ?? cleaned;
  const attempts = [candidate];
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end > start) attempts.push(candidate.slice(start, end + 1));
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as unknown;
    } catch {
      // try the next candidate
    }
  }
  return outputError('reply is not valid JSON');
}

// ---------- public entry point ----------

const TOTAL_BUDGET_MS = 25_000; // keep below the routes' maxDuration (30 s)
const ATTEMPT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 2;

/** Runs the request with provider fallback and returns validated JSON. */
export async function completeJson<T>(request: JsonRequest<T>): Promise<AiResult<T>> {
  const providers = configuredProviders();
  if (providers.length === 0) {
    throw new ApiError(
      503,
      'ai_not_configured',
      'No AI provider configured (GROQ_API_KEY, or CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN)',
    );
  }

  // With a single provider the second attempt is a retry on the same one.
  const plan: ProviderConfig[] = [];
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
    const p = providers[i % providers.length];
    if (p !== undefined) plan.push(p);
  }

  const started = Date.now();
  let messages = request.messages;

  for (const provider of plan) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - started);
    if (remaining < 1_000) break;
    try {
      const completion = await callProvider(provider, messages, {
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        signal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remaining)),
      });
      try {
        const value = request.validate(extractJson(completion.text));
        return {
          value,
          provider: provider.name,
          model: provider.model,
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        if (!(err instanceof AiOutputError)) throw err;
        // Let the next attempt see why the reply was rejected.
        messages = [
          ...request.messages,
          { role: 'assistant', content: completion.text },
          {
            role: 'user',
            content: `That reply was rejected: ${err.message}. Reply again with ONLY the corrected JSON object.`,
          },
        ];
        console.error(`[ai] ${provider.name} returned unusable output: ${err.message}`);
      }
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      console.error(`[ai] ${err.provider} failed: ${err.message}`);
    }
  }
  throw new ApiError(
    502,
    'ai_unavailable',
    'AI provider unavailable or returned unusable output. Try again shortly.',
  );
}
