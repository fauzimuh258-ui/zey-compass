// app/(dashboard)/projects/new/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AnalyzeButton } from '@/components/ai/AnalyzeButton';
import { SuggestionCard } from '@/components/ai/SuggestionCard';
import {
  applySuggestionToValues,
  EMPTY_FORM_VALUES,
  formValuesToPatch,
  ProjectForm,
  type ProjectFormValues,
} from '@/components/projects/ProjectForm';
import { Alert } from '@/components/ui';
import { useProjectMutations } from '@/lib/hooks/useProjects';
import type { AnalyzeResult } from '@/lib/ai/scoring';

export default function NewProjectPage() {
  const router = useRouter();
  const { create, isSubmitting, error } = useProjectMutations();
  const [values, setValues] = useState<ProjectFormValues>(EMPTY_FORM_VALUES);
  const [suggestion, setSuggestion] = useState<AnalyzeResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const patch = formValuesToPatch(values);
    if (patch.name === undefined || patch.name === '') return;
    try {
      const project = await create({ ...patch, name: patch.name });
      router.push(`/projects/${project.id}`);
    } catch {
      // error already surfaced via useProjectMutations().error
    }
  };

  return (
    <div className="stack">
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>Proyek baru</h1>

      <AnalyzeButton
        draft={{
          name: values.name.trim() === '' ? undefined : values.name,
          description: values.description.trim() === '' ? null : values.description,
          category: values.category.trim() === '' ? null : values.category,
          deploy_location: values.deploy_location.trim() === '' ? null : values.deploy_location,
        }}
        disabled={values.name.trim() === ''}
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
            setValues((prev) => applySuggestionToValues(prev, result.suggestion));
            setSuggestion(null);
          }}
          onDismiss={() => setSuggestion(null)}
        />
      ) : null}

      <ProjectForm
        values={values}
        onChange={setValues}
        onSubmit={handleSubmit}
        submitLabel="Buat proyek"
        isSubmitting={isSubmitting}
        error={error}
      />
    </div>
  );
}
