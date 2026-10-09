// components/insights/InsightsView.tsx
'use client';

// Shows stored insights (seeded from the Server Component) and a button to
// generate a fresh batch via POST /api/ai/insights (all 3 types at once -
// the endpoint already supports picking types, but one button is simpler
// for this screen; see app/api/ai/insights/route.ts for the full contract).
import { useState } from 'react';
import { Alert, Button, Card, EmptyState } from '@/components/ui';
import { api, ClientApiError } from '@/lib/client-api';
import { relativeDays } from '@/lib/format';
import type { InsightRow, InsightType } from '@/types/compass';

const TYPE_LABEL: Record<InsightType, string> = {
  weekly_review: 'Review Mingguan',
  project_recommendation: 'Rekomendasi Proyek',
  skill_gap: 'Skill Gap',
};

type GenerateOutcome =
  | { type: InsightType; status: 'ok'; insight: InsightRow & { items: string[] } }
  | { type: InsightType; status: 'error'; error: { code: string; message: string } };

function isOk(outcome: GenerateOutcome): outcome is Extract<GenerateOutcome, { status: 'ok' }> {
  return outcome.status === 'ok';
}

export function InsightsView({ initialInsights }: { initialInsights: InsightRow[] }) {
  const [insights, setInsights] = useState(initialInsights);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (): Promise<void> => {
    setIsGenerating(true);
    setError(null);
    try {
      const outcomes = await api.post<GenerateOutcome[]>('/api/ai/insights');
      const succeeded = outcomes.filter(isOk);
      if (succeeded.length > 0) {
        setInsights((prev) => [...succeeded.map((o) => o.insight), ...prev]);
      }
      const failed = outcomes.find((o): o is Extract<GenerateOutcome, { status: 'error' }> => o.status === 'error');
      if (failed !== undefined) {
        const prefix = succeeded.length > 0 ? `${TYPE_LABEL[failed.type]} gagal: ` : '';
        setError(`${prefix}${failed.error.message}`);
      }
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Gagal generate insight');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Insights</h1>
        <Button onClick={() => void handleGenerate()} disabled={isGenerating}>
          {isGenerating ? 'Menganalisis...' : 'Generate insight'}
        </Button>
      </div>

      {error !== null ? <Alert variant="error">{error}</Alert> : null}

      {insights.length === 0 ? (
        <EmptyState title="Belum ada insight" hint="Klik 'Generate insight' di atas" />
      ) : (
        <div className="stack">
          {insights.map((insight) => (
            <Card key={insight.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="badge">{TYPE_LABEL[insight.type]}</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{relativeDays(insight.created_at)}</span>
              </div>
              <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 'var(--space-2)' }}>{insight.content}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
