// lib/api.ts
import { NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient, type TypedSupabase } from '@/lib/supabase/server';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers: Record<string, string>;

  constructor(status: number, code: string, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

export type AuthContext = { supabase: TypedSupabase; userId: string };

export const notFound = (what: string): ApiError =>
  new ApiError(404, 'not_found', `${what} not found`);

export function ok<T>(data: T, meta?: Record<string, unknown>, status = 200): Response {
  return NextResponse.json(meta ? { data, meta } : { data }, { status });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

function toResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message } },
      { status: err.status, headers: err.headers },
    );
  }
  console.error('[api] unhandled error', err);
  return NextResponse.json(
    { error: { code: 'internal_error', message: 'Unexpected error' } },
    { status: 500 },
  );
}

/** Maps a PostgREST error to an ApiError without leaking internals. */
export function dbError(error: PostgrestError): ApiError {
  switch (error.code) {
    case 'PGRST116':
      return notFound('Resource');
    case 'PGRST301':
      return new ApiError(401, 'unauthorized', 'Session expired');
    case '42501':
      return new ApiError(403, 'forbidden', 'Not allowed');
    case '23505':
      return new ApiError(409, 'conflict', 'Resource already exists');
    case '23503':
      return new ApiError(409, 'conflict', 'Referenced resource does not exist');
    case '23502':
    case '23514':
    case '22P02':
    case '22001':
    case '22003':
      return new ApiError(422, 'validation_error', 'Value rejected by database constraints');
    default:
      console.error('[db]', error.code, error.message);
      return new ApiError(500, 'internal_error', 'Database error');
  }
}

/** Returns `data` or throws. For queries where `null` is never a valid result. */
export function unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) throw dbError(res.error);
  if (res.data === null) throw new ApiError(500, 'internal_error', 'Empty database response');
  return res.data;
}

const MAX_BODY_CHARS = 64 * 1024;

/** Reads a JSON body. With `optional`, an empty body yields `{}`. */
export async function readJson(request: Request, optional = false): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) {
    throw new ApiError(413, 'payload_too_large', 'Body exceeds 64K characters');
  }
  if (text.trim() === '') {
    if (optional) return {};
    throw new ApiError(400, 'invalid_body', 'Body is required');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, 'invalid_json', 'Body is not valid JSON');
  }
}

/** Auth guard + error mapping. Every handler body runs inside this. */
export async function withAuth(
  handler: (ctx: AuthContext) => Promise<Response>,
): Promise<Response> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new ApiError(401, 'unauthorized', 'Authentication required');
    return await handler({ supabase, userId: data.user.id });
  } catch (err) {
    return toResponse(err);
  }
}

/** Fixed-window limiter backed by the compass_hit_rate_limit RPC. Fails closed. */
export async function enforceRateLimit(
  { supabase }: AuthContext,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const { data, error } = await supabase.rpc('compass_hit_rate_limit', {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw dbError(error);
  const row = data?.[0];
  if (!row) throw new ApiError(500, 'internal_error', 'Rate limiter unavailable');
  if (!row.allowed) {
    const wait = Math.max(1, Math.ceil((Date.parse(row.reset_at) - Date.now()) / 1000));
    throw new ApiError(429, 'rate_limited', 'Too many requests', { 'Retry-After': String(wait) });
  }
}
