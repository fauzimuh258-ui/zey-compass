// components/projects/ProjectsView.tsx
'use client';

// [NEW, not in Zi's file list - flagged] The interactive part of the Projects
// screen: search, status filters, list/kanban toggle, kanban drag-and-drop.
// Split from app/(dashboard)/projects/page.tsx because that file must stay a
// Server Component to redirect ?new=1 immediately (see its own comment) -
// per "Server Components query Supabase langsung, Client Components pakai
// lib/client-api.ts" this split is required wherever a page needs both.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { EmptyState, Skeleton } from '@/components/ui';
import { KanbanBoard } from '@/components/projects/KanbanBoard';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { ProjectFilters, type ViewMode } from '@/components/projects/ProjectFilters';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useProjectMutations, useProjects } from '@/lib/hooks/useProjects';
import type { ProjectStatus } from '@/types/compass';

export function ProjectsView({ autoFocusSearch }: { autoFocusSearch: boolean }) {
  const [searchInput, setSearchInput] = useState('');
  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
  const [view, setView] = useState<ViewMode>('list');
  const debouncedSearch = useDebounce(searchInput, 300);

  const query = useMemo(
    () => ({ q: debouncedSearch, status: statuses, sort: 'composite' as const, order: 'desc' as const }),
    [debouncedSearch, statuses],
  );
  const { projects, isLoading, error, refetch, patchLocal } = useProjects(query);
  const { update } = useProjectMutations();

  const handleMove = async (id: string, status: ProjectStatus): Promise<void> => {
    patchLocal(id, { status }); // optimistic
    try {
      await update(id, { status });
    } catch {
      refetch(); // revert to server truth on failure
    }
  };

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Projects</h1>
        <Link href="/projects/new" className="btn btn-primary">
          Proyek baru
        </Link>
      </div>

      <ProjectFilters
        q={searchInput}
        onQChange={setSearchInput}
        statuses={statuses}
        onStatusesChange={setStatuses}
        view={view}
        onViewChange={setView}
        autoFocusSearch={autoFocusSearch}
      />

      {error !== null ? <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p> : null}

      {isLoading ? (
        <div className="grid-cards">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ height: 120 }} />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState title="Belum ada proyek" hint={<Link href="/projects/new">Tambah proyek pertama</Link>} />
      ) : view === 'kanban' ? (
        <KanbanBoard projects={projects} onMove={handleMove} />
      ) : (
        <div className="grid-cards">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
