// app/auth/callback/route.ts
// Exchanges the OAuth / magic-link code for a session, then redirects.
// Public path (see middleware.ts PUBLIC_PATHS): the user is not signed in yet
// when this runs.
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest): Promise<Response> {
  const code = request.nextUrl.searchParams.get('code');
  const next = request.nextUrl.searchParams.get('next') ?? '/';
  // Guard against an open redirect via a crafted ?next= value.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (code !== null) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error === null) return NextResponse.redirect(new URL(safeNext, request.url));
  }

  const failed = new URL('/login', request.url);
  failed.searchParams.set('error', 'auth_failed');
  return NextResponse.redirect(failed);
}
