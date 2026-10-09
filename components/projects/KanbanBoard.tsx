// components/projects/KanbanBoard.tsx
'use client';

// Native HTML5 drag-and-drop (no external DnD library).
import { useState, type DragEvent } from 'react';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { statusLabel } from '@/lib/format';
import { PROJECT_STATUSES, type ProjectStatus, type ProjectSummary } from '@/types/compass';

const DRAG_MIME = 'application/x-zey-compass-project-id';

export function KanbanBoard({
  projects,
  onMove,
}: {
  projects: ProjectSummary[];
  onMove: (id: string, status: ProjectStatus) => void;
}) {
  const [dragOverColumn, setDragOverColumn] = useState<ProjectStatus | null>(null);

  const handleDragStart = (event: DragEvent<HTMLAnchorElement>, id: string): void => {
    event.dataTransfer.setData(DRAG_MIME, id);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, status: ProjectStatus): void => {
    event.preventDefault();
    setDragOverColumn(null);
    const id = event.dataTransfer.getData(DRAG_MIME);
    if (id !== '') onMove(id, status);
  };

  return (
    <div className="row scroll-x kanban-board" style={{ alignItems: 'flex-start' }}>
      {PROJECT_STATUSES.map((status) => {
        const columnProjects = projects.filter((p) => p.status === status);
        return (
          <div
            key={status}
            className="kanban-column"
            onDragOver={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              setDragOverColumn(status);
            }}
            onDragLeave={() => setDragOverColumn((current) => (current === status ? null : current))}
            onDrop={(event: DragEvent<HTMLDivElement>) => handleDrop(event, status)}
            style={{ borderColor: dragOverColumn === status ? 'var(--accent)' : 'var(--border)' }}
          >
            <div className="row" style={{ justifyContent: 'space-between', padding: 'var(--space-2)' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{statusLabel(status)}</span>
              <span className="badge">{columnProjects.length}</span>
            </div>
            <div className="stack" style={{ gap: 'var(--space-2)', padding: '0 var(--space-2) var(--space-2)' }}>
              {columnProjects.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-faint)', padding: 'var(--space-2)' }}>Kosong</p>
              ) : (
                columnProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    draggable
                    onDragStart={(event) => handleDragStart(event, project.id)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
