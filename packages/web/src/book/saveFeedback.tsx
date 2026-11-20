/** Shared error handling for save actions: 422 issue lists, a generic failure message, field reverts. */
import { useCallback, useState, type ReactNode } from 'react';
import type { ValidationIssue } from '@bookly/shared';
import { ApiError } from '../api/client';
import { IssueList } from './IssueList';

/** Message shown for every failure that is not a validation rejection. */
export const SAVE_FAILED_MESSAGE = 'Speichern fehlgeschlagen. Bitte erneut versuchen.';

/** Result of {@link useSaveFeedback}. */
export interface SaveFeedback {
  /** Render this where errors should appear. */
  feedback: ReactNode;
  /** Pass as the `onError` of a mutation. */
  onError: (error: unknown) => void;
  /** Shows local validation issues (nothing was sent) and reverts the field. */
  reject: (issues: ValidationIssue[]) => void;
  /** Clears all messages. */
  clear: () => void;
  /** Changes whenever a save failed or was rejected; fields use it to fall back to stored values. */
  resetKey: number;
}

/** Extracts the issue list from a 422 response, or null for every other error. */
export function issuesOf(error: unknown): ValidationIssue[] | null {
  if (!(error instanceof ApiError) || error.status !== 422) return null;
  const body = error.body as { issues?: ValidationIssue[] } | undefined;
  return body?.issues ?? null;
}

/** State and rendering for save feedback: 422 shows the issues, anything else the generic alert. */
export function useSaveFeedback(): SaveFeedback {
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [failed, setFailed] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const clear = useCallback(() => {
    setIssues([]);
    setFailed(false);
  }, []);
  const onError = useCallback((error: unknown) => {
    const found = issuesOf(error);
    setIssues(found ?? []);
    setFailed(found === null);
    setResetKey((k) => k + 1);
  }, []);
  const reject = useCallback((found: ValidationIssue[]) => {
    setIssues(found);
    setFailed(false);
    setResetKey((k) => k + 1);
  }, []);
  const feedback = (
    <>
      <IssueList issues={issues} />
      {failed && (
        <p className="error" role="alert">
          {SAVE_FAILED_MESSAGE}
        </p>
      )}
    </>
  );
  return { feedback, onError, reject, clear, resetKey };
}
