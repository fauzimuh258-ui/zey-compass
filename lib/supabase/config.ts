// lib/supabase/config.ts
// Static `process.env.X` access on purpose: Next.js only inlines values it can
// see literally, and middleware runs on the Edge runtime.
export function supabaseConfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or Supabase publishable/anon key');
  }
  return { url, key };
}
