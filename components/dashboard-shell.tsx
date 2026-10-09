// components/dashboard-shell.tsx
'use client';

// Client-side chrome for every /(dashboard) page: header, nav, theme toggle,
// sign out, and the global Cmd+K / Cmd+N shortcuts. app/(dashboard)/layout.tsx
// (a Server Component) does the auth check and passes down the signed-in
// user's display name; this component only handles interactivity.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { createClient } from '@/lib/supabase/client';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/skills', label: 'Skills' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/insights', label: 'Insights' },
] as const;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

export function DashboardShell({
  displayName,
  email,
  children,
}: {
  displayName: string | null;
  email: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey) || isTypingTarget(event.target)) return;
      // Projects page reads ?focus=search / ?new=1 to act on these.
      if (event.key === 'k') {
        event.preventDefault();
        router.push('/projects?focus=search');
      } else if (event.key === 'n') {
        event.preventDefault();
        router.push('/projects?new=1');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  const handleSignOut = async (): Promise<void> => {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div style={{ minHeight: '100%' }}>
      <header
        className="row"
        style={{ justifyContent: 'space-between', padding: 'var(--space-3)', borderBottom: '1px solid var(--border)' }}
      >
        <span style={{ fontWeight: 700 }}>Zey Compass</span>
        <div className="row">
          <ThemeToggle />
          <span className="badge" title={email ?? undefined}>
            {displayName ?? email ?? 'Akun'}
          </span>
          <Button variant="ghost" onClick={handleSignOut}>
            Keluar
          </Button>
        </div>
      </header>
      <nav
        className="row scroll-x"
        style={{ padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--border)' }}
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="btn btn-ghost"
            style={{
              borderColor: pathname === item.href ? 'var(--accent)' : 'var(--border)',
              color: pathname === item.href ? 'var(--accent)' : 'var(--text)',
              flexShrink: 0,
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <main style={{ padding: 'var(--space-3)' }}>{children}</main>
    </div>
  );
}
