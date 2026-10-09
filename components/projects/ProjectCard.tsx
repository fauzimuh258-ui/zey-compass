// components/projects/ProjectCard.tsx
import Link from 'next/link';
import type { DragEvent } from 'react';
import { ScoreBar } from '@/components/ui';
import { StatusBadge } from '@/components/projects/StatusBadge';
import { formatScore, relativeDays } from '@/lib/format';
import type { ProjectSummary } from '@/types/compass';

export function ProjectCard({
  project,
  draggable = false,
  onDragStart,
}: {
  project: ProjectSummary;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="card project-card"
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{ fontWeight: 600 }}>{project.name}</span>
          <span className="badge">{formatScore(project.score_composite)}</span>
        </div>
        {project.category !== null ? (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{project.category}</span>
        ) : null}
        <ScoreBar value={project.score_composite} />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <StatusBadge status={project.status} />
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{relativeDays(project.updated_at)}</span>
        </div>
      </div>
    </Link>
  );
}
