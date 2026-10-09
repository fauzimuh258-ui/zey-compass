// lib/hooks/useProjects.ts
'use client';

// Client-side data hooks for the Projects screens. Mirrors the server route
// contracts in app/api/projects/*; canonical sort keys live in
// app/api/projects/route.ts (SORT_COLUMNS) - duplicated here as a literal
// union since that file does not export a type for the frontend to import.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ClientApiError } from '@/lib/client-api';
import type { Project, ProjectCreate, ProjectPatch, ProjectStatus, ProjectSummary } from '@/types/compass';

export type ProjectSort =
  | 'composite'
  | 'monetisasi'
  | 'engineering'
  | 'infrastruktur'
  | 'skill_fit'
  | 'strategic'
  | 'updated'
  | 'created'
  | 'name';

export type ProjectsQuery = {
  status?: ProjectStatus[];
  category?: string;
  q?: string;
  sort?: ProjectSort;
  order?: 'asc' | 'desc';
  limit?: number;
};

// Fetches up to 200 projects at once: this is a solo-founder tool, not a
// paginated enterprise list, and the kanban view needs every status column
// populated from a single fetch anyway.
const DEFAULT_LIMIT = 200;

function queryKey(q: ProjectsQuery): string {
  return JSON.stringify({ ...q, status: q.status?.slice().sort() });
}

function toErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ClientApiError ? err.message : fallback;
}

/** Fetches the project list for the given filters and keeps it in sync. */
export function useProjects(query: ProjectsQuery) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const key = queryKey(query);

  const refetch = useCallback(() => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    api
      .get<ProjectSummary[]>('/api/projects', {
        status: query.status && query.status.length > 0 ? query.status.join(',') : undefined,
        category: query.category,
        q: query.q,
        sort: query.sort,
        order: query.order,
        limit: query.limit ?? DEFAULT_LIMIT,
      })
      .then((data) => {
        if (id !== requestId.current) return; // a newer request already landed
        setProjects(data);
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        setError(toErrorMessage(err, 'Gagal memuat proyek'));
      })
      .finally(() => {
        if (id === requestId.current) setIsLoading(false);
      });
    // `key` is the real dependency (query, stringified); query itself is a
    // fresh object every render so it cannot go in this array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  /** Optimistic local patch (e.g. kanban drag) without a full refetch. */
  const patchLocal = useCallback((id: string, patch: Partial<ProjectSummary>) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  return { projects, isLoading, error, refetch, patchLocal };
}

/** Create / update / delete, with shared submitting + error state. */
export function useProjectMutations() {
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
    (payload: ProjectCreate) => run(() => api.post<Project>('/api/projects', payload)),
    [run],
  );
  const update = useCallback(
    (id: string, patch: ProjectPatch) => run(() => api.patch<Project>(`/api/projects/${id}`, patch)),
    [run],
  );
  const remove = useCallback((id: string) => run(() => api.delete(`/api/projects/${id}`)), [run]);

  return { create, update, remove, isSubmitting, error };
}
