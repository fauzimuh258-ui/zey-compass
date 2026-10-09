// components/ai/SuggestionCard.tsx
import { Button, Card } from '@/components/ui';
import { formatScore } from '@/lib/format';
import type { AnalyzeResult } from '@/lib/ai/scoring';

const SCORE_FIELDS: {
  key: 'score_monetisasi' | 'score_engineering' | 'score_infrastruktur' | 'score_skill_fit' | 'score_strategic';
  label: string;
}[] = [
  { key: 'score_monetisasi', label: 'Monetisasi' },
  { key: 'score_engineering', label: 'Engineering' },
  { key: 'score_infrastruktur', label: 'Infrastruktur' },
  { key: 'score_skill_fit', label: 'Skill Fit' },
  { key: 'score_strategic', label: 'Strategic' },
];

export function SuggestionCard({
  result,
  onApply,
  onDismiss,
}: {
  result: AnalyzeResult;
  onApply: (result: AnalyzeResult) => void;
  onDismiss: () => void;
}) {
  const { suggestion, composite_preview, current } = result;
  return (
    <Card style={{ borderColor: 'var(--accent)' }}>
      <div className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700 }}>Saran AI</span>
          <span className="badge">
            Preview: {formatScore(composite_preview)}
            {current !== null ? ` (sekarang ${formatScore(current.score_composite)})` : ''}
          </span>
        </div>
        <p style={{ fontSize: 13 }}>{suggestion.reasoning}</p>
        <div className="stack" style={{ gap: 'var(--space-1)' }}>
          {SCORE_FIELDS.map((field) => (
            <div key={field.key} className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>{field.label}</span>
              <span>{suggestion[field.key]}</span>
            </div>
          ))}
          {suggestion.estimated_time_hours !== null ? (
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>Estimasi jam</span>
              <span>{suggestion.estimated_time_hours}</span>
            </div>
          ) : null}
        </div>
        {suggestion.required_skills.length > 0 ? (
          <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-1)' }}>
            {suggestion.required_skills.map((skill) => (
              <span key={skill.name} className="badge">
                {skill.name} ({skill.level})
              </span>
            ))}
          </div>
        ) : null}
        <div className="row">
          <Button onClick={() => onApply(result)} style={{ flex: 1 }}>
            Terapkan
          </Button>
          <Button variant="ghost" onClick={onDismiss} style={{ flex: 1 }}>
            Tutup
          </Button>
        </div>
      </div>
    </Card>
  );
}
