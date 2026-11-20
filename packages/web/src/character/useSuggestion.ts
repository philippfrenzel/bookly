/** Hook for requesting an AI suggestion (behavior and intentions) from a given endpoint. */
import { useCallback, useState } from 'react';
import type { Suggestion, SuggestionBody } from '@bookly/shared';
import { ApiError, api } from '../api/client';

/** State and actions of {@link useSuggestion}. */
export interface SuggestionState {
  suggestion: Suggestion | null;
  loading: boolean;
  error: string | null;
  /** POSTs the draft; ignored while a request is in flight. */
  request: (draft: SuggestionBody) => void;
  /** Clears the suggestion and any error. */
  dismiss: () => void;
}

/** Short German message for a failed suggestion request. */
function messageFor(error: unknown): string {
  return error instanceof ApiError && error.status === 503 ? 'KI nicht eingerichtet.' : 'Vorschlag fehlgeschlagen.';
}

/** Requests suggestions from `path`; the body is the draft (an empty object for storyline additions). */
export function useSuggestion(path: string): SuggestionState {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(
    (draft: SuggestionBody) => {
      if (loading) return;
      setLoading(true);
      setError(null);
      api<Suggestion>('POST', path, draft)
        .then(setSuggestion)
        .catch((e: unknown) => setError(messageFor(e)))
        .finally(() => setLoading(false));
    },
    [loading, path],
  );

  const dismiss = useCallback(() => {
    setSuggestion(null);
    setError(null);
  }, []);

  return { suggestion, loading, error, request, dismiss };
}
