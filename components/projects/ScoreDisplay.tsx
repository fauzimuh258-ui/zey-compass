// components/projects/ScoreDisplay.tsx
import { ScoreBar } from '@/components/ui';
import { formatScore } from '@/lib/format';
import type { ProjectRow } from '@/types/compass';

type Scores = Pick<
  ProjectRow,
  | 'score_monetisasi'
  | 'score_engineering'
  | 'score_infrastruktur'
  | 'score_skill_fit'
  | 'score_strategic'
  | 'score_composite'
>;

const DIMENSIONS: { key: keyof Omit<Scores, 'score_composite'>; label: string }[] = [
  { key: 'score_monetisasi', label: 'Monetisasi' },
  { key: 'score_engineering', label: 'Engineering' },
  { key: 'score_infrastruktur', label: 'Infrastruktur' },
  { key: 'score_skill_fit', label: 'Skill Fit' },
  { key: 'score_strategic', label: 'Strategic' },
];

/** Compact by default (composite only); `detailed` adds the 5-dimension breakdown. */
export function ScoreDisplay({ scores, detailed = false }: { scores: Scores; detailed?: boolean }) {
  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Composite</span>
        <span style={{ fontWeight: 700, fontSize: detailed ? 24 : 14 }}>{formatScore(scores.score_composite)}</span>
      </div>
      <ScoreBar value={scores.score_composite} />
      {detailed ? (
        <div className="stack" style={{ gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
          {DIMENSIONS.map((d) => (
            <div key={d.key} className="stack" style={{ gap: 2 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.label}</span>
                <span style={{ fontSize: 12 }}>{scores[d.key]}</span>
              </div>
              <ScoreBar value={scores[d.key]} />
            </div>
          ))}
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 'var(--space-1)' }}>
            Engineering dibalik di composite (100 - nilai) - proyek makin sulit, skor makin rendah.
          </p>
        </div>
      ) : null}
    </div>
  );
}
