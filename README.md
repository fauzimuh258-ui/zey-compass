<!-- README.md -->
# Zey Compass

Personal Strategic OS — track, score, and prioritize projects by five
weighted dimensions (monetization, engineering complexity, infrastructure
contribution, skill fit, strategic value), plus skill-gap analysis, a daily
schedule, and AI-assisted insights.

Stack: Next.js 14 (App Router), TypeScript (strict), Supabase (Postgres +
Auth), vanilla `fetch` (no HTTP client libraries), no CSS framework.

## Setup

1. **Supabase project**
   - Create a project at supabase.com.
   - SQL Editor -> run `supabase/migrations/20260920000000_init.sql` once.
   - Authentication -> Providers -> enable Google (add your OAuth client
     ID/secret) and Email (magic link is on by default).
   - Authentication -> URL Configuration -> add your site URL and
     `<site-url>/auth/callback` as a redirect URL.

2. **Environment variables** - copy `.env.local.example` to `.env.local`
   and fill it in (Supabase keys, `COMPASS_ENCRYPTION_KEY`, at least one AI
   provider).

3. **Install and run**
   ```bash
   npm install
   npm run dev
