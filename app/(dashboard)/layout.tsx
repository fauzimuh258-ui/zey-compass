// app/(dashboard)/layout.tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  // Belt-and-suspenders: middleware.ts already redirects unauthenticated
  // requests before they reach here.
  if (data.user === null) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', data.user.id)
    .maybeSingle();

  return (
    <DashboardShell displayName={profile?.display_name ?? null} email={data.user.email ?? null}>
      {children}
    </DashboardShell>
  );
}
