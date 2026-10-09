// components/projects/ProjectDetailView.tsx
'use client';

// [NEW, not in Zi's file list - flagged] Same reason as ProjectsView.tsx:
// app/(dashboard)/projects/[id]/page.tsx must stay a Server Component (direct
// Supabase query + notFound()), so the interactive edit/delete/analyze UI
// lives here instead.
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AnalyzeButton } from '@/components/ai/AnalyzeButton';
import { SuggestionCard } from '@/components/ai/SuggestionCard';
import {
  applySuggestionToValues,
  formValuesToPatch,
  ProjectForm,
  projectToFormValues,
  type ProjectFormValues,
} from '@/components/projects/ProjectForm';
import { ScoreDisplay } from '@/components/projects/ScoreDisplay';
import { StatusBadge } from '@/components/projects/StatusBadge';
import { Alert, Button, Card } from '@/components/ui';
import { relativeDays } from '@/lib/format';
import { projectSkillGap } from '@/lib/skills';
import { useProjectMutations } from '@/lib/hooks/useProjects';
import type { AnalyzeResult } from '@/lib/ai/scoring';
import type { Project, SkillGapItem, SkillRow } from '@/types/compass';

const SKILL_STATUS_LABEL: Record<SkillGapItem['status'], string> = {
  met: 'Sudah dikuasai',
  below: 'Level kurang',
  missing: 'Belum punya',
};

export function ProjectDetailView({
  project,
  skills,
  initialSkillGap,
}: {
  project: Project;
  skills: SkillRow[];
  initialSkillGap: SkillGapItem[];
}) {
  const router = useRouter();
  const { update, remove, isSubmitting, error } = useProjectMutations();
  const [current, setCurrent] = useState(project);
  const [skillGap, setSkillGap] = useState(initialSkillGap);
  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState<ProjectFormValues>(() => projectToFormValues(project));
  const [suggestion, setSuggestion] = useState<AnalyzeResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const startEdit = (): void => {
    setValues(projectToFormValues(current));
    setIsEditing(true);
  };

  const cancelEdit = (): void => {
    setIsEditing(false);
    setSuggestion(null);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    try {
      const updated = await update(current.id, formValuesToPatch(values));
      setCurrent(updated);
      setSkillGap(projectSkillGap(updated.required_skills, skills));
      setIsEditing(false);
      setSuggestion(null);
    } catch {
      // error already surfaced via useProjectMutations().error
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!window.confirm(`Hapus "${current.name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setIsDeleting(true);
    try {
      await remove(current.id);
      router.push('/projects');
    } catch {
      setIsDeleting(false);
    }
  };

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>{current.name}</h1>
          <div className="row" style={{ marginTop: 'var(--space-1)' }}>
            <StatusBadge status={current.status} />
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>diupdate {relativeDays(current.updated_at)}</span>
          </div>
        </div>
        {!isEditing ? (
          <div className="row">
            <Button variant="ghost" onClick={startEdit}>
              Edit
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Menghapus...' : 'Hapus'}
            </Button>
          </div>
        ) : null}
      </div>

      <AnalyzeButton
        draft={{ project_id: current.id }}
        onResult={(result) => {
          setSuggestion(result);
          setAnalyzeError(null);
        }}
        onError={setAnalyzeError}
      />
      {analyzeError !== null ? <Alert variant="error">{analyzeError}</Alert> : null}
      {suggestion !== null ? (
        <SuggestionCard
          result={suggestion}
          onApply={(result) => {
            setValues(applySuggestionToValues(projectToFormValues(current), result.suggestion));
            setIsEditing(true);
            setSuggestion(null);
          }}
          onDismiss={() => setSuggestion(null)}
        />
      ) : null}

      {isEditing ? (
        <ProjectForm
          values={values}
          onChange={setValues}
          onSubmit={handleSave}
          submitLabel="Simpan perubahan"
          isSubmitting={isSubmitting}
          error={error}
        />
      ) : (
        <>
          <Card>
            <ScoreDisplay scores={current} detailed />
          </Card>

          {current.description !== null ? (
            <Card>
              <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{current.description}</p>
            </Card>
          ) : null}

          <Card>
            <div className="stack" style={{ gap: 'var(--space-2)' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Kategori</span>
                <span style={{ fontSize: 13 }}>{current.category ?? '-'}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lokasi deploy</span>
                <span style={{ fontSize: 13 }}>{current.deploy_location ?? '-'}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Estimasi waktu</span>
                <span style={{ fontSize: 13 }}>
                  {current.estimated_time_hours !== null ? `${current.estimated_time_hours} jam` : '-'}
                </span>
              </div>
              {Array.isArray(current.tech_stack) && current.tech_stack.length > 0 ? (
                <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                  {current.tech_stack
                    .filter((v): v is string => typeof v === 'string')
                    .map((tech) => (
                      <span key={tech} className="badge">
                        {tech}
                      </span>
                    ))}
                </div>
              ) : null}
            </div>
          </Card>

          {skillGap.length > 0 ? (
            <Card>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 'var(--space-2)' }}>Skill gap</p>
              <div className="stack" style={{ gap: 'var(--space-1)' }}>
                {skillGap.map((gap) => (
                  <div key={gap.name} className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
                    <span>
                      {gap.name} ({gap.required_level})
                    </span>
                    <span style={{ color: gap.status === 'met' ? 'var(--success)' : 'var(--text-muted)' }}>
                      {SKILL_STATUS_LABEL[gap.status]}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {current.manfaat !== null || current.risk_analysis !== null || current.success_metric !== null ? (
            <Card>
              <div className="stack">
                {current.manfaat !== null ? (
                  <div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Manfaat</p>
                    <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{current.manfaat}</p>
                  </div>
                ) : null}
                {current.risk_analysis !== null ? (
                  <div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Analisis risiko</p>
                    <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{current.risk_analysis}</p>
                  </div>
                ) : null}
                {current.success_metric !== null ? (
                  <div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Success metric</p>
                    <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{current.success_metric}</p>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}
        </>
      )}

      {isEditing ? (
        <Button variant="ghost" onClick={cancelEdit}>
          Batal
        </Button>
      ) : null}
    </div>
  );
}
