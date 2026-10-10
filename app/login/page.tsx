// app/login/page.tsx
// [ASSUMPTION] Not in the original screen list, but middleware.ts (Part 2)
// redirects every unauthenticated request here, so without this page the app
// is unreachable. Google OAuth + email magic link, per the spec's "Supabase
// Auth (Google + email)". The outer shell is a Server Component so it paints
// immediately; only LoginForm (which needs useSearchParams) is inside Suspense.
import { Suspense } from 'react';
import { Card, Skeleton } from '@/components/ui';
import { LoginForm } from '@/components/login-form';

function LoginFormSkeleton() {
  return (
    <div className="stack">
      <Skeleton style={{ height: 20, width: '60%' }} />
      <Skeleton style={{ height: 40 }} />
      <Skeleton style={{ height: 40 }} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <main
      className="row"
      style={{ minHeight: '100dvh', justifyContent: 'center', alignItems: 'center', padding: 'var(--space-3)' }}
    >
      <Card style={{ width: '100%', maxWidth: 360 }}>
        <Suspense fallback={<LoginFormSkeleton />}>
          <LoginForm />
        </Suspense>
      </Card>
    </main>
  );
}
