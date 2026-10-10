// middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfig } from '@/lib/supabase/config';

// Reachable without a session (the login UI and OAuth callback land in Part 4).
const PUBLIC_PATHS = ['/login', '/auth'];
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// [ASSUMPTION] Spec: session expiry 30 days. Dashboard time-boxing may need a paid
// plan, so the limit is enforced here from the last sign-in time.
const MAX_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function sessionExpired(lastSignInAt: string | undefined): boolean {
  if (lastSignInAt === undefined) return false;
  const signedInAt = Date.parse(lastSignInAt);
  return Number.isFinite(signedInAt) && Date.now() - signedInAt > MAX_SESSION_MS;
}

function denied(status: 401 | 403, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  // CSRF: browsers always send Origin on unsafe methods, so reject cross-origin ones.
  if (isApi && UNSAFE_METHODS.has(request.method)) {
    const origin = request.headers.get('origin');
    if (origin !== null && origin !== request.nextUrl.origin) {
      return denied(403, 'forbidden', 'Cross-origin request blocked');
    }
  }

  let response = NextResponse.next({ request });
  const { url, key } = supabaseConfig();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() re-validates the JWT with Supabase Auth. Never trust getSession() here.
  const { data } = await supabase.auth.getUser();
  const user = data.user !== null && !sessionExpired(data.user.last_sign_in_at) ? data.user : null;

  if (user === null) {
    if (isApi) return denied(401, 'unauthorized', 'Authentication required');
    const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!isPublic) {
      const login = request.nextUrl.clone();
      login.pathname = '/login';
      login.search = '';
      login.searchParams.set('next', pathname);
      return NextResponse.redirect(login);
    }
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
