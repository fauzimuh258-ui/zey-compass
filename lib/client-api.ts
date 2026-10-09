// lib/client-api.ts
// Vanilla-fetch wrapper for Client Components calling our own /api/* routes.
// Parses the {data} / {error: {code, message}} envelope from lib/api.ts.
// Server Components should query Supabase directly (see lib/supabase/server.ts)
// instead of fetching our own API over HTTP.
import type { ApiFailure, ApiSuccess } from '@/types/compass';

export class ClientApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// [ASSUMPTION, per Zi's note on slice 4a] give up after 30s instead of
// hanging forever on a stalled connection.
const TIMEOUT_MS = 30_000;

function isFailure(body: unknown): body is ApiFailure {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const err = (body as { error: unknown }).error;
  return typeof err === 'object' && err !== null && 'code' in err && 'message' in err;
}

function hasData(body: unknown): body is ApiSuccess<unknown> {
  return typeof body === 'object' && body !== null && 'data' in body;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ClientApiError(res.status, 'invalid_response', 'Server returned a non-JSON response');
  }
  if (isFailure(body)) throw new ClientApiError(res.status, body.error.code, body.error.message);
  if (!res.ok) throw new ClientApiError(res.status, 'unknown_error', `HTTP ${res.status}`);
  if (!hasData(body)) throw new ClientApiError(res.status, 'invalid_response', 'Response is missing a data field');
  return (body as ApiSuccess<T>).data;
}

/** Runs fetch with a timeout, turning a network error or timeout into a ClientApiError. */
async function runFetch(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ClientApiError(0, 'timeout', 'Request timed out, please try again');
    }
    throw new ClientApiError(0, 'network_error', 'Could not reach the server');
  }
}

export type Query = Record<string, string | number | boolean | undefined>;

function withQuery(path: string, query?: Query): string {
  if (query === undefined) return path;
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs === '' ? path : `${path}?${qs}`;
}

async function send<T>(path: string, method: 'POST' | 'PATCH' | 'PUT', body: unknown): Promise<T> {
  const res = await runFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

export const api = {
  get: async <T>(path: string, query?: Query): Promise<T> => {
    const res = await runFetch(withQuery(path, query), { headers: { Accept: 'application/json' } });
    return parse<T>(res);
  },
  post: <T>(path: string, body?: unknown): Promise<T> => send<T>(path, 'POST', body),
  patch: <T>(path: string, body: unknown): Promise<T> => send<T>(path, 'PATCH', body),
  put: <T>(path: string, body: unknown): Promise<T> => send<T>(path, 'PUT', body),
  delete: async (path: string): Promise<void> => {
    const res = await runFetch(path, { method: 'DELETE' });
    await parse<void>(res);
  },
};
