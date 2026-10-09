// components/projects/ProjectForm.tsx
'use client';

// Controlled form shared by the create and edit screens. All state lives in
// the parent page (values + onChange) so an AI suggestion applied via
// SuggestionCard can update the same fields the user is editing.
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Alert, Button } from '@/components/ui';
import { statusLabel } from '@/lib/format';
import type { ScoringSuggestion } from '@/lib/ai/scoring';
import {
  DEFAULT_WEIGHTS,
  PROJECT_STATUSES,
  SKILL_LEVELS,
  type Json,
  type ProjectPatch,
  type ProjectStatus,
  type RequiredSkill,
  type SkillLevel,
} from '@/types/compass';

export type ProjectFormValues = {
  name: string;
  description: string;
  category: string;
  status: ProjectStatus;
  score_monetisasi: number;
  score_engineering: number;
  score_infrastruktur: number;
  score_skill_fit: number;
  score_strategic: number;
  tech_stack: string; // comma-separated in the UI; converted to a JSON string array on submit
  deploy_location: string;
  estimated_time_hours: string; // kept as text for the input; parsed on submit
  required_skills: RequiredSkill[];
  manfaat: string;
  risk_analysis: string;
  success_metric: string;
};

export const EMPTY_FORM_VALUES: ProjectFormValues = {
  name: '',
  description: '',
  category: '',
  status: 'backlog',
  score_monetisasi: 0,
  score_engineering: 0,
  score_infrastruktur: 0,
  score_skill_fit: 0,
  score_strategic: 0,
  tech_stack: '',
  deploy_location: '',
  estimated_time_hours: '',
  required_skills: [],
  manfaat: '',
  risk_analysis: '',
  success_metric: '',
};

function techStackToText(techStack: Json | null): string {
  if (techStack === null) return '';
  if (Array.isArray(techStack)) {
    return techStack.filter((v): v is string => typeof v === 'string').join(', ');
  }
  return typeof techStack === 'string' ? techStack : JSON.stringify(techStack);
}

function techStackFromText(text: string): string[] | null {
  const items = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  return items.length === 0 ? null : items;
}

/** Loads an existing project (or partial AI draft) into editable form state. */
export function projectToFormValues(project: {
  name: string;
  description: string | null;
  category: string | null;
  status: ProjectStatus;
  score_monetisasi: number;
  score_engineering: number;
  score_infrastruktur: number;
  score_skill_fit: number;
  score_strategic: number;
  tech_stack: Json | null;
  deploy_location: string | null;
  estimated_time_hours: number | null;
  required_skills: RequiredSkill[];
  manfaat: string | null;
  risk_analysis: string | null;
  success_metric: string | null;
}): ProjectFormValues {
  return {
    name: project.name,
    description: project.description ?? '',
    category: project.category ?? '',
    status: project.status,
    score_monetisasi: project.score_monetisasi,
    score_engineering: project.score_engineering,
    score_infrastruktur: project.score_infrastruktur,
    score_skill_fit: project.score_skill_fit,
    score_strategic: project.score_strategic,
    tech_stack: techStackToText(project.tech_stack),
    deploy_location: project.deploy_location ?? '',
    estimated_time_hours: project.estimated_time_hours === null ? '' : String(project.estimated_time_hours),
    required_skills: project.required_skills,
    manfaat: project.manfaat ?? '',
    risk_analysis: project.risk_analysis ?? '',
    success_metric: project.success_metric ?? '',
  };
}

/** Converts form state into a payload for POST/PATCH /api/projects. */
export function formValuesToPatch(values: ProjectFormValues): ProjectPatch {
  const hoursText = values.estimated_time_hours.trim();
  const parsedHours = hoursText === '' ? NaN : Number(hoursText);
  return {
    name: values.name.trim(),
    description: values.description.trim() === '' ? null : values.description.trim(),
    category: values.category.trim() === '' ? null : values.category.trim(),
    status: values.status,
    score_monetisasi: values.score_monetisasi,
    score_engineering: values.score_engineering,
    score_infrastruktur: values.score_infrastruktur,
    score_skill_fit: values.score_skill_fit,
    score_strategic: values.score_strategic,
    tech_stack: techStackFromText(values.tech_stack),
    deploy_location: values.deploy_location.trim() === '' ? null : values.deploy_location.trim(),
    estimated_time_hours: Number.isNaN(parsedHours) ? null : Math.round(parsedHours),
    required_skills: values.required_skills,
    manfaat: values.manfaat.trim() === '' ? null : values.manfaat.trim(),
    risk_analysis: values.risk_analysis.trim() === '' ? null : values.risk_analysis.trim(),
    success_metric: values.success_metric.trim() === '' ? null : values.success_metric.trim(),
  };
}

/** Merges an AI suggestion's scores/skills/estimate into existing form values (name, description, etc. are untouched - they are the analyze INPUT, not its output). */
export function applySuggestionToValues(values: ProjectFormValues, suggestion: ScoringSuggestion): ProjectFormValues {
  return {
    ...values,
    score_monetisasi: suggestion.score_monetisasi,
    score_engineering: suggestion.score_engineering,
    score_infrastruktur: suggestion.score_infrastruktur,
    score_skill_fit: suggestion.score_skill_fit,
    score_strategic: suggestion.score_strategic,
    required_skills: suggestion.required_skills,
    estimated_time_hours:
      suggestion.estimated_time_hours === null ? values.estimated_time_hours : String(suggestion.estimated_time_hours),
  };
}

/** [ASSUMPTION] rough live preview using default weights while editing; the
 * saved composite (real per-user weights) only exists after the server
 * responds. Mirrors compass_composite() in the Part 1 migration. */
function previewCompositeDefaultWeights(values: ProjectFormValues): number {
  const w = DEFAULT_WEIGHTS;
  const sum =
    values.score_monetisasi * w.monetisasi +
    (100 - values.score_engineering) * w.engineering +
    values.score_infrastruktur * w.infrastruktur +
    values.score_skill_fit * w.skill_fit +
    values.score_strategic * w.strategic;
  return Math.round(sum * 100) / 100;
}

const inputStyle = {
  height: 40,
  padding: '0 var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated-2)',
  width: '100%',
} as const;

const textareaStyle = {
  ...inputStyle,
  height: 'auto',
  padding: 'var(--space-2) var(--space-3)',
  minHeight: 80,
} as const;

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="stack" style={{ gap: 'var(--space-1)' }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      {children}
      {hint !== undefined ? <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{hint}</span> : null}
    </label>
  );
}

type ScoreKey =
  | 'score_monetisasi'
  | 'score_engineering'
  | 'score_infrastruktur'
  | 'score_skill_fit'
  | 'score_strategic';

const SCORE_FIELDS: { key: ScoreKey; label: string; hint?: string }[] = [
  { key: 'score_monetisasi', label: 'Monetisasi' },
  {
    key: 'score_engineering',
    label: 'Engineering',
    hint: 'Makin sulit, makin tinggi (dibalik saat dihitung ke composite)',
  },
  { key: 'score_infrastruktur', label: 'Infrastruktur' },
  { key: 'score_skill_fit', label: 'Skill Fit' },
  { key: 'score_strategic', label: 'Strategic' },
];

export function ProjectForm({
  values,
  onChange,
  onSubmit,
  submitLabel,
  isSubmitting,
  error,
}: {
  values: ProjectFormValues;
  onChange: (values: ProjectFormValues) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [skillName, setSkillName] = useState('');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('beginner');

  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]): void => {
    onChange({ ...values, [key]: value });
  };

  const addSkill = (): void => {
    const name = skillName.trim();
    if (name === '') return;
    const exists = values.required_skills.some((s) => s.name.toLowerCase() === name.toLowerCase());
    if (!exists) set('required_skills', [...values.required_skills, { name, level: skillLevel }]);
    setSkillName('');
  };

  const removeSkill = (name: string): void => {
    set(
      'required_skills',
      values.required_skills.filter((s) => s.name !== name),
    );
  };

  return (
    <form onSubmit={onSubmit} className="stack" style={{ gap: 'var(--space-4)' }}>
      {error !== null ? <Alert variant="error">{error}</Alert> : null}

      <div className="stack">
        <Field label="Nama proyek">
          <input
            required
            maxLength={120}
            value={values.name}
            onChange={(event: ChangeEvent<HTMLInputElement>) => set('name', event.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Deskripsi">
          <textarea
            maxLength={2000}
            value={values.description}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => set('description', event.target.value)}
            style={textareaStyle}
          />
        </Field>
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <div style={{ flex: 1 }}>
            <Field label="Kategori">
              <input
                maxLength={60}
                value={values.category}
                onChange={(event: ChangeEvent<HTMLInputElement>) => set('category', event.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Status">
              <select
                value={values.status}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => set('status', event.target.value as ProjectStatus)}
                style={inputStyle}
              >
                {PROJECT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </div>

      <div className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Scoring</span>
          <span className="badge">Preview: {previewCompositeDefaultWeights(values).toFixed(1)}</span>
        </div>
        {SCORE_FIELDS.map((field) => (
          <Field key={field.key} label={`${field.label} (${values[field.key]})`} hint={field.hint}>
            <input
              type="range"
              min={0}
              max={100}
              value={values[field.key]}
              onChange={(event: ChangeEvent<HTMLInputElement>) => set(field.key, Number(event.target.value))}
              style={{ width: '100%' }}
            />
          </Field>
        ))}
      </div>

      <div className="stack">
        <Field label="Tech stack" hint="Pisahkan dengan koma, contoh: Next.js 14, Supabase, Vercel">
          <input
            value={values.tech_stack}
            onChange={(event: ChangeEvent<HTMLInputElement>) => set('tech_stack', event.target.value)}
            style={inputStyle}
          />
        </Field>
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <div style={{ flex: 1 }}>
            <Field label="Lokasi deploy">
              <input
                value={values.deploy_location}
                onChange={(event: ChangeEvent<HTMLInputElement>) => set('deploy_location', event.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Estimasi jam">
              <input
                type="number"
                min={0}
                value={values.estimated_time_hours}
                onChange={(event: ChangeEvent<HTMLInputElement>) => set('estimated_time_hours', event.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="stack">
        <span style={{ fontSize: 13, fontWeight: 600 }}>Skill dibutuhkan</span>
        {values.required_skills.length > 0 ? (
          <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-1)' }}>
            {values.required_skills.map((skill) => (
              <span key={skill.name} className="badge">
                {skill.name} ({skill.level})
                <button
                  type="button"
                  onClick={() => removeSkill(skill.name)}
                  aria-label={`Hapus skill ${skill.name}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <input
            placeholder="Nama skill"
            value={skillName}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSkillName(event.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <select
            value={skillLevel}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setSkillLevel(event.target.value as SkillLevel)}
            style={inputStyle}
          >
            {SKILL_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          <Button type="button" variant="ghost" onClick={addSkill}>
            Tambah
          </Button>
        </div>
      </div>

      <div className="stack">
        <Field label="Manfaat">
          <textarea
            maxLength={5000}
            value={values.manfaat}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => set('manfaat', event.target.value)}
            style={textareaStyle}
          />
        </Field>
        <Field label="Analisis risiko">
          <textarea
            maxLength={5000}
            value={values.risk_analysis}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => set('risk_analysis', event.target.value)}
            style={textareaStyle}
          />
        </Field>
        <Field label="Success metric">
          <textarea
            maxLength={1000}
            value={values.success_metric}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => set('success_metric', event.target.value)}
            style={textareaStyle}
          />
        </Field>
      </div>

      <Button type="submit" disabled={isSubmitting || values.name.trim() === ''}>
        {isSubmitting ? 'Menyimpan...' : submitLabel}
      </Button>
    </form>
  );
}
