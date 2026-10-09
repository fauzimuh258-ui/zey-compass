// components/projects/StatusBadge.tsx
import { statusLabel } from '@/lib/format';
import type { ProjectStatus } from '@/types/compass';

const STATUS_COLOR: Record<ProjectStatus, string> = {
  backlog: 'var(--text-faint)',
  next: 'var(--text-muted)',
  in_progress: 'var(--accent)',
  review: 'var(--accent)',
  done: 'var(--success)',
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className="badge">
      <span className="status-dot" style={{ background: STATUS_COLOR[status] }} aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}
