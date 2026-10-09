// app/(dashboard)/schedule/page.tsx
'use client';

// Single client page: no redirect/notFound logic is needed here (unlike
// Projects), so there is no reason to split a Server wrapper from the
// interactive part - see components/projects/ProjectsView.tsx for when that
// split IS required.
import { useEffect, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { Alert, Button, Card, EmptyState, Skeleton } from '@/components/ui';
import { GenerateSchedule } from '@/components/schedule/GenerateSchedule';
import { api, ClientApiError } from '@/lib/client-api';
import { todayInAppTimezone } from '@/lib/dates';
import { formatMinutes } from '@/lib/format';
import type { Schedule, ScheduleBlock } from '@/types/compass';

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday..Sunday range containing `date` (plain UTC date math, no timezone library). */
export function weekRange(date: string): { from: string; to: string } {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const from = addDays(date, diffToMonday);
  return { from, to: addDays(from, 6) };
}

export function weekDates(from: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(from, i));
}

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function dayLabel(date: string): string {
  return DAY_LABELS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';
}

export function plannedMinutes(blocks: ScheduleBlock[]): number {
  return blocks.reduce((sum, b) => sum + b.duration_min, 0);
}

const inputStyle = {
  height: 36,
  padding: '0 var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated-2)',
} as const;

const EMPTY_BLOCK_DRAFT = { time: '', duration_min: '', task: '', type: '' };

export default function SchedulePage() {
  const [date, setDate] = useState(todayInAppTimezone());
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [week, setWeek] = useState<Schedule[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(EMPTY_BLOCK_DRAFT);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    api
      .get<Schedule | null>('/api/schedule', { date })
      .then((data) => {
        if (!cancelled) setBlocks(data?.blocks ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ClientApiError ? err.message : 'Gagal memuat jadwal');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    const { from, to } = weekRange(date);
    api
      .get<Schedule[]>('/api/schedule', { from, to })
      .then((data) => {
        if (!cancelled) setWeek(data);
      })
      .catch(() => {
        // the week strip is a nice-to-have; a failed fetch just leaves it empty
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const save = async (nextBlocks: ScheduleBlock[]): Promise<void> => {
    const previous = blocks;
    setBlocks(nextBlocks); // optimistic
    setIsSaving(true);
    setError(null);
    try {
      await api.put<Schedule>('/api/schedule', { date, blocks: nextBlocks });
    } catch (err) {
      setBlocks(previous); // revert
      setError(err instanceof ClientApiError ? err.message : 'Gagal menyimpan jadwal');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddBlock = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (draft.time === '' || draft.task.trim() === '') return;
    const duration = Number(draft.duration_min);
    if (!Number.isFinite(duration) || duration <= 0) return;
    const block: ScheduleBlock = { time: draft.time, duration_min: Math.round(duration), task: draft.task.trim() };
    if (draft.type.trim() !== '') block.type = draft.type.trim();
    await save([...blocks, block]);
    setDraft(EMPTY_BLOCK_DRAFT);
    setShowForm(false);
  };

  const handleRemoveBlock = async (index: number): Promise<void> => {
    await save(blocks.filter((_, i) => i !== index));
  };

  const handleDrop = async (targetIndex: number): Promise<void> => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const reordered = [...blocks];
    const [moved] = reordered.splice(dragIndex, 1);
    if (moved !== undefined) reordered.splice(targetIndex, 0, moved);
    setDragIndex(null);
    await save(reordered);
  };

  const { from } = weekRange(date);
  const dates = weekDates(from);

  return (
    <div className="stack">
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>Schedule</h1>

      <div className="row scroll-x" style={{ gap: 'var(--space-1)' }}>
        {dates.map((d) => {
          const day = week.find((w) => w.date === d);
          const minutes = day ? plannedMinutes(day.blocks) : 0;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              className="btn btn-ghost"
              style={{
                flexDirection: 'column',
                height: 56,
                minWidth: 64,
                flexShrink: 0,
                borderColor: d === date ? 'var(--accent)' : 'var(--border)',
                color: d === date ? 'var(--accent)' : 'var(--text)',
              }}
            >
              <span style={{ fontSize: 11 }}>{dayLabel(d)}</span>
              <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                {minutes === 0 ? '-' : formatMinutes(minutes)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <Button variant="ghost" onClick={() => setDate((d) => addDays(d, -1))}>
            &larr;
          </Button>
          <input
            type="date"
            value={date}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setDate(event.target.value)}
            style={inputStyle}
          />
          <Button variant="ghost" onClick={() => setDate((d) => addDays(d, 1))}>
            &rarr;
          </Button>
        </div>
        <Button variant="ghost" onClick={() => setDate(todayInAppTimezone())}>
          Hari ini
        </Button>
      </div>

      <GenerateSchedule date={date} existingCount={blocks.length} onApply={(generated) => void save(generated)} />

      {error !== null ? <Alert variant="error">{error}</Alert> : null}

      {isLoading ? (
        <Skeleton style={{ height: 160 }} />
      ) : (
        <Card>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {blocks.length === 0 ? 'Belum ada blok' : `Total ${formatMinutes(plannedMinutes(blocks))} terjadwal`}
              {isSaving ? ' - menyimpan...' : ''}
            </span>
            {!showForm ? (
              <Button variant="ghost" onClick={() => setShowForm(true)}>
                Tambah blok
              </Button>
            ) : null}
          </div>

          {showForm ? (
            <form onSubmit={handleAddBlock} className="stack" style={{ marginTop: 'var(--space-3)' }}>
              <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <input
                  type="time"
                  required
                  value={draft.time}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, time: event.target.value }))}
                  style={inputStyle}
                />
                <input
                  type="number"
                  required
                  min={1}
                  placeholder="Menit"
                  value={draft.duration_min}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setDraft((d) => ({ ...d, duration_min: event.target.value }))
                  }
                  style={{ ...inputStyle, width: 90 }}
                />
                <input
                  placeholder="Tipe (opsional)"
                  value={draft.type}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, type: event.target.value }))}
                  style={{ ...inputStyle, flex: 1, minWidth: 100 }}
                />
              </div>
              <input
                required
                placeholder="Task"
                value={draft.task}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, task: event.target.value }))}
                style={inputStyle}
              />
              <div className="row">
                <Button type="submit">Simpan blok</Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false);
                    setDraft(EMPTY_BLOCK_DRAFT);
                  }}
                >
                  Batal
                </Button>
              </div>
            </form>
          ) : null}

          {blocks.length === 0 ? (
            <EmptyState title="Belum ada jadwal" hint="Tambah blok pertama di atas" />
          ) : (
            <div className="stack" style={{ marginTop: 'var(--space-3)', gap: 'var(--space-1)' }}>
              {blocks.map((block, index) => (
                <div
                  key={`${block.time}-${index}`}
                  className="row"
                  style={{
                    justifyContent: 'space-between',
                    padding: 'var(--space-2)',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${dragIndex === index ? 'var(--accent)' : 'var(--border)'}`,
                    cursor: 'grab',
                  }}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
                  onDrop={(event: DragEvent<HTMLDivElement>) => {
                    event.preventDefault();
                    void handleDrop(index);
                  }}
                >
                  <div className="row">
                    <span className="badge">{block.time}</span>
                    <span style={{ fontSize: 13 }}>{block.task}</span>
                    {block.type !== undefined ? <span className="badge">{block.type}</span> : null}
                  </div>
                  <div className="row">
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{formatMinutes(block.duration_min)}</span>
                    <Button variant="danger" onClick={() => void handleRemoveBlock(index)}>
                      Hapus
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
