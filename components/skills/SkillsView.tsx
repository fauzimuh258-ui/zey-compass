// components/skills/SkillsView.tsx
'use client';

// Heatmap (demand-weighted tiles) + top-10 gap list + owned-skills list with
// inline add/edit/delete. Seeded from Server Component props so there is no
// loading flash on first paint; refetches via lib/client-api.ts after a
// mutation (demand/gap can shift when a skill's level or name changes).
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Button, Card, EmptyState } from '@/components/ui';
import { api, ClientApiError } from '@/lib/client-api';
import { useSkillMutations } from '@/lib/hooks/useSkills';
import { SKILL_LEVELS, type SkillGapEntry, type SkillLevel, type SkillWithDemand } from '@/types/compass';

const LEVEL_LABEL: Record<SkillLevel, string> = { beginner: 'Pemula', intermediate: 'Menengah', expert: 'Ahli' };
const GAP_STATUS_LABEL: Record<SkillGapEntry['status'], string> = { below: 'Level kurang', missing: 'Belum punya' };

const inputStyle = {
  height: 36,
  padding: '0 var(--space-2)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated-2)',
} as const;

const EMPTY_DRAFT = { name: '', level: 'beginner' as SkillLevel, category: '', learningResource: '', estimatedHours: '' };

function SkillHeatmap({ skills }: { skills: SkillWithDemand[] }) {
  if (skills.length === 0) return <EmptyState title="Belum ada skill" hint="Tambah skill pertama di bawah" />;
  const maxDemand = Math.max(1, ...skills.map((s) => s.demand));
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
      {skills.map((skill) => {
        const intensity = skill.demand / maxDemand;
        return (
          <div
            key={skill.id}
            className="skill-tile"
            style={{ opacity: skill.demand === 0 ? 0.45 : 0.5 + intensity * 0.5, fontSize: 12 + intensity * 6 }}
            title={`Dipakai di ${skill.demand} proyek aktif`}
          >
            <span>{skill.name}</span>
            <span className="skill-tile-demand">{skill.demand}</span>
          </div>
        );
      })}
    </div>
  );
}

export function SkillsView({
  initialSkills,
  initialGap,
}: {
  initialSkills: SkillWithDemand[];
  initialGap: SkillGapEntry[];
}) {
  const [skills, setSkills] = useState(initialSkills);
  const [gap, setGap] = useState(initialGap);
  const [listError, setListError] = useState<string | null>(null);
  const { create, update, remove, isSubmitting, error } = useSkillMutations();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const refetch = async (): Promise<void> => {
    try {
      const data = await api.get<{ skills: SkillWithDemand[]; gap: SkillGapEntry[] }>('/api/skills');
      setSkills(data.skills);
      setGap(data.gap);
      setListError(null);
    } catch (err) {
      setListError(err instanceof ClientApiError ? err.message : 'Gagal memuat skill');
    }
  };

  const resetForm = (): void => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setShowForm(false);
  };

  const startEdit = (skill: SkillWithDemand): void => {
    setEditingId(skill.id);
    setDraft({
      name: skill.name,
      level: skill.level,
      category: skill.category ?? '',
      learningResource: skill.learning_resource ?? '',
      estimatedHours: skill.estimated_hours === null ? '' : String(skill.estimated_hours),
    });
    setShowForm(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (draft.name.trim() === '') return;
    const hoursText = draft.estimatedHours.trim();
    const parsedHours = hoursText === '' ? NaN : Number(hoursText);
    const payload = {
      name: draft.name.trim(),
      level: draft.level,
      category: draft.category.trim() === '' ? null : draft.category.trim(),
      learning_resource: draft.learningResource.trim() === '' ? null : draft.learningResource.trim(),
      estimated_hours: Number.isNaN(parsedHours) ? null : Math.round(parsedHours),
    };
    try {
      if (editingId !== null) await update(editingId, payload);
      else await create(payload);
      resetForm();
      await refetch();
    } catch {
      // error already surfaced via useSkillMutations().error
    }
  };

  const handleDelete = async (skill: SkillWithDemand): Promise<void> => {
    if (!window.confirm(`Hapus skill "${skill.name}"?`)) return;
    try {
      await remove(skill.id);
      await refetch();
    } catch {
      // error already surfaced via useSkillMutations().error
    }
  };

  return (
    <div className="stack">
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>Skills</h1>

      <Card>
        <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 'var(--space-3)' }}>
          Peta skill (ukuran &amp; terang = makin sering dibutuhkan proyek aktif)
        </p>
        {listError !== null ? <Alert variant="error">{listError}</Alert> : null}
        <SkillHeatmap skills={skills} />
      </Card>

      {gap.length > 0 ? (
        <Card>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 'var(--space-3)' }}>
            Prioritas belajar (top {gap.length}, diurut dari paling dibutuhkan)
          </p>
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {gap.map((entry, i) => (
              <div key={entry.name} className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="row">
                    <span className="badge">{i + 1}</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{entry.name}</span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                    Dibutuhkan {entry.demand} proyek - target {LEVEL_LABEL[entry.required_level]}
                    {entry.current_level !== null ? ` (sekarang ${LEVEL_LABEL[entry.current_level]})` : ''}
                    {entry.estimated_hours !== null ? ` - sekitar ${entry.estimated_hours} jam` : ''}
                  </p>
                  {entry.learning_resource !== null ? (
                    <a href={entry.learning_resource} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
                      Resource belajar
                    </a>
                  ) : null}
                </div>
                <span className="badge">{GAP_STATUS_LABEL[entry.status]}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <p style={{ fontSize: 13, fontWeight: 700 }}>Semua skill</p>
          {!showForm ? (
            <Button variant="ghost" onClick={() => setShowForm(true)}>
              Tambah skill
            </Button>
          ) : null}
        </div>

        {showForm ? (
          <form onSubmit={handleSubmit} className="stack" style={{ marginTop: 'var(--space-3)' }}>
            {error !== null ? <Alert variant="error">{error}</Alert> : null}
            <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <input
                required
                placeholder="Nama skill"
                value={draft.name}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, name: event.target.value }))}
                style={{ ...inputStyle, flex: 1, minWidth: 140 }}
              />
              <select
                value={draft.level}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setDraft((d) => ({ ...d, level: event.target.value as SkillLevel }))
                }
                style={inputStyle}
              >
                {SKILL_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </select>
            </div>
            <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <input
                placeholder="Kategori (opsional)"
                value={draft.category}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, category: event.target.value }))}
                style={{ ...inputStyle, flex: 1, minWidth: 140 }}
              />
              <input
                type="number"
                min={0}
                placeholder="Estimasi jam"
                value={draft.estimatedHours}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDraft((d) => ({ ...d, estimatedHours: event.target.value }))
                }
                style={{ ...inputStyle, width: 120 }}
              />
            </div>
            <input
              placeholder="Link resource belajar (opsional)"
              value={draft.learningResource}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setDraft((d) => ({ ...d, learningResource: event.target.value }))
              }
              style={inputStyle}
            />
            <div className="row">
              <Button type="submit" disabled={isSubmitting || draft.name.trim() === ''}>
                {isSubmitting ? 'Menyimpan...' : editingId !== null ? 'Simpan perubahan' : 'Tambah'}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>
                Batal
              </Button>
            </div>
          </form>
        ) : null}

        {skills.length > 0 ? (
          <div className="stack" style={{ marginTop: 'var(--space-3)', gap: 'var(--space-1)' }}>
            {skills.map((skill) => (
              <div key={skill.id} className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row">
                  <span style={{ fontSize: 13 }}>{skill.name}</span>
                  <span className="badge">{LEVEL_LABEL[skill.level]}</span>
                  {skill.demand > 0 ? <span className="badge">dipakai {skill.demand}x</span> : null}
                </div>
                <div className="row">
                  <Button variant="ghost" onClick={() => startEdit(skill)}>
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => void handleDelete(skill)}>
                    Hapus
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
