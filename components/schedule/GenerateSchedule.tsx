// components/schedule/GenerateSchedule.tsx
'use client';

// Button -> small form (hours, energy pattern) -> proposed schedule card.
// Only used from the Schedule page, so trigger + result live in one file
// (unlike AnalyzeButton/SuggestionCard in Projects, which are reused across
// two pages and so stayed split).
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Button, Card } from '@/components/ui';
import { api, ClientApiError } from '@/lib/client-api';
import { formatMinutes } from '@/lib/format';
import type { ScheduleBlock } from '@/types/compass';

type GeneratedSchedule = { blocks: ScheduleBlock[]; reasoning: string };

// [ASSUMPTION] presets for the spec's "energy pattern (pagi produktif, malam
// santai, dll)" - a select is faster to use from a phone than free text.
const ENERGY_PRESETS = [
  { value: 'pagi', label: 'Pagi produktif, malam santai' },
  { value: 'malam', label: 'Malam produktif, pagi lambat' },
  { value: 'konsisten', label: 'Konsisten sepanjang hari' },
] as const;

const fieldStyle = {
  height: 36,
  padding: '0 var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated-2)',
} as const;

export function GenerateSchedule({
  date,
  existingCount,
  onApply,
}: {
  date: string;
  existingCount: number;
  onApply: (blocks: ScheduleBlock[]) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [hours, setHours] = useState('6');
  const [energyPattern, setEnergyPattern] = useState<string>(ENERGY_PRESETS[0].value);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedSchedule | null>(null);

  const handleGenerate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const availableHours = Number(hours);
    if (!Number.isFinite(availableHours) || availableHours <= 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.post<GeneratedSchedule>('/api/schedule/generate', {
        date,
        available_hours: Math.round(availableHours),
        energy_pattern: ENERGY_PRESETS.find((p) => p.value === energyPattern)?.label ?? energyPattern,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'AI generate gagal');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = (): void => {
    if (result === null) return;
    if (existingCount > 0 && !window.confirm(`Ganti ${existingCount} blok yang sudah ada hari ini dengan jadwal AI?`)) {
      return;
    }
    onApply(result.blocks);
    setResult(null);
    setShowForm(false);
  };

  if (!showForm && result === null) {
    return (
      <Button variant="ghost" onClick={() => setShowForm(true)}>
        Generate jadwal dengan AI
      </Button>
    );
  }

  return (
    <Card style={{ borderColor: 'var(--accent)' }}>
      <div className="stack">
        {result === null ? (
          <form onSubmit={handleGenerate} className="stack">
            <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <input
                type="number"
                min={1}
                max={16}
                value={hours}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setHours(event.target.value)}
                style={{ ...fieldStyle, width: 90 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>jam tersedia hari ini</span>
            </div>
            <select
              value={energyPattern}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => setEnergyPattern(event.target.value)}
              style={fieldStyle}
            >
              {ENERGY_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {error !== null ? <Alert variant="error">{error}</Alert> : null}
            <div className="row">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Menyusun...' : 'Generate'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Batal
              </Button>
            </div>
          </form>
        ) : (
          <>
            <p style={{ fontWeight: 700 }}>Jadwal usulan AI</p>
            <p style={{ fontSize: 13 }}>{result.reasoning}</p>
            <div className="stack" style={{ gap: 'var(--space-1)' }}>
              {result.blocks.map((block, i) => (
                <div key={`${block.time}-${i}`} className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
                  <span>
                    {block.time} - {block.task}
                  </span>
                  <span style={{ color: 'var(--text-faint)' }}>{formatMinutes(block.duration_min)}</span>
                </div>
              ))}
            </div>
            <div className="row">
              <Button onClick={handleApply} style={{ flex: 1 }}>
                Terapkan
              </Button>
              <Button variant="ghost" onClick={() => setResult(null)} style={{ flex: 1 }}>
                Buat ulang
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
