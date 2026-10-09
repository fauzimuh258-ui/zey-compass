// app/(dashboard)/projects/page.tsx
import { redirect } from 'next/navigation';
import { ProjectsView } from '@/components/projects/ProjectsView';

export default function ProjectsPage({
  searchParams,
}: {
  searchParams: { new?: string; focus?: string };
}) {
  // The dashboard shell's Cmd+N shortcut links here with ?new=1; the actual
  // create flow lives on its own page (projects/new). Redirecting here
  // (Server Component, before any client JS) keeps that shortcut working
  // without duplicating the create UI on this page.
  if (searchParams.new === '1') redirect('/projects/new');

  return <ProjectsView autoFocusSearch={searchParams.focus === 'search'} />;
}
