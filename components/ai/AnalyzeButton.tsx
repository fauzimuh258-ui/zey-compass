// components/ai/AnalyzeButton.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { api, ClientApiError } from '@/lib/client-api';
import type { AnalyzeResult } from '@/lib/ai/scoring';
import type { Json } from '@/types/compass';

// project_id re-analyzes a saved project; the draft fields analyze a project
// that has not been created yet. Matches POST /api/ai/analyze's body.
export type AnalyzeDraft = {
  project_id?: string;
  name?: string;
  description?: string | null;
  category?: string | null;
  tech_stack?: Json | null;
  deploy_location?: string | null;
};

export function AnalyzeButton({
  draft,
  onResult,
  onError,
  disabled = false,
}: {
  draft: AnalyzeDraft;
  onResult: (result: AnalyzeResult) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async (): Promise<void> => {
    setIsLoading(true);
    try {
      const result = await api.post<AnalyzeResult>('/api/ai/analyze', draft);
      onResult(result);
    } catch (err) {
      onError?.(err instanceof ClientApiError ? err.message : 'AI analyze gagal');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button type="button" variant="ghost" onClick={handleClick} disabled={disabled || isLoading}>
      {isLoading ? 'Menganalisis...' : 'Analisis dengan AI'}
    </Button>
  );
}
