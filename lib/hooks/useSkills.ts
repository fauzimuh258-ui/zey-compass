// lib/hooks/useSkills.ts
'use client';

// Create/update/delete for the Skills screen. The list itself is seeded from
// the Server Component (app/(dashboard)/skills/page.tsx) and refetched
// locally in components/skills/SkillsView.tsx after a mutation, so this file
// only owns the mutation half (mirrors useProjectMutations in useProjects.ts).
import { useCallback, useState } from 'react';
import { api, ClientApiError } from '@/lib/client-api';
import type { SkillLevel, SkillRow } from '@/types/compass';

export type SkillPayload = {
  name: string;
  level?: SkillLevel;
  category?: string | null;
  learning_resource?: string | null;
  estimated_hours?: number | null;
};

function toErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ClientApiError ? err.message : fallback;
}

export function useSkillMutations() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setIsSubmitting(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(toErrorMessage(err, 'Terjadi kesalahan'));
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const create = useCallback(
    (payload: SkillPayload) => run(() => api.post<SkillRow>('/api/skills', payload)),
    [run],
  );
  const update = useCallback(
    (id: string, patch: Partial<SkillPayload>) => run(() => api.patch<SkillRow>(`/api/skills/${id}`, patch)),
    [run],
  );
  const remove = useCallback((id: string) => run(() => api.delete(`/api/skills/${id}`)), [run]);

  return { create, update, remove, isSubmitting, error };
}
