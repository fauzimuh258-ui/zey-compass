// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseConfig } from '@/lib/supabase/config';
import type { Database } from '@/types/compass';

/** Per-request server client. Runs as the signed-in user, so RLS applies. */
export function createClient() {
  const cookieStore = cookies();
  const { url, key } = supabaseConfig();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Read-only cookie context (Server Component): middleware refreshes the session.
        }
      },
    },
  });
}

export type TypedSupabase = ReturnType<typeof createClient>;
