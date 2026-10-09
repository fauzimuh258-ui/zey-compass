// components/projects/ProjectFilters.tsx
'use client';

import { useEffect, useRef, type ChangeEvent } from 'react';
import { Button } from '@/components/ui';
import { statusLabel } from '@/lib/format';
import { PROJECT_STATUSES, type ProjectStatus } from '@/types/compass';

export type ViewMode = 'list' | 'kanban';

export function ProjectFilters({
  q,
  onQChange,
  statuses,
  onStatusesChange,
  view,
  onViewChange,
  autoFocusSearch = false,
}: {
  q: string;
  onQChange: (value: string) => void;
  statuses: ProjectStatus[];
  onStatusesChange: (value: ProjectStatus[]) => void;
  view: ViewMode;
  onViewChange: (value: ViewMode) => void;
  autoFocusSearch?: boolean;
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusSearch) searchRef.current?.focus();
  }, [autoFocusSearch]);

  const toggleStatus = (status: ProjectStatus): void => {
    onStatusesChange(statuses.includes(status) ? statuses.filter((s) => s !== status) : [...statuses, status]);
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <input
          ref={searchRef}
          type="search"
          value={q}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onQChange(event.target.value)}
          placeholder="Cari proyek... (Cmd+K)"
          style={{
            flex: 1,
            height: 40,
            padding: '0 var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--bg-elevated-2)',
          }}
        />
        <Button variant="ghost" onClick={() => onViewChange(view === 'list' ? 'kanban' : 'list')}>
          {view === 'list' ? 'Kanban' : 'List'}
        </Button>
      </div>
      <div className="row scroll-x" style={{ gap: 'var(--space-1)' }}>
        {PROJECT_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => toggleStatus(status)}
            className="btn btn-ghost"
            style={{
              height: 32,
              fontSize: 12,
              flexShrink: 0,
              borderColor: statuses.includes(status) ? 'var(--accent)' : 'var(--border)',
              color: statuses.includes(status) ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            {statusLabel(status)}
          </button>
        ))}
      </div>
    </div>
  );
}
