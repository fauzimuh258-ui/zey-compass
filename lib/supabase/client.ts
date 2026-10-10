// lib/supabase/client.ts
// Browser-side Supabase client. Only import this from Client Components
// ('use client'): it reads/writes auth cookies via document.cookie, unlike
// lib/supabase/server.ts which runs per-request on the server.
import { createBrowserClient } from '@supabase/ssr';
import { supabaseConfig } from '@/lib/supabase/config';
import type { Database } from '@/types/compass';

type BrowserSupabase = ReturnType<typeof createBrowserClient<Database>>;
let cached: BrowserSupabase | undefined;

/** Singleton browser client; safe to call from multiple components. */
export function createClient(): BrowserSupabase {
  if (cached === undefined) {
    const { url, key } = supabaseConfig();
    cached = createBrowserClient<Database>(url, key);
  }
  return cached;
}
