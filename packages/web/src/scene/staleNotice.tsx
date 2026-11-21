/**
 * Handling of stale scene saves (409 `stale`): another tab changed the assignment since this one loaded it.
 * The book is reloaded and a message says so; nothing is merged (spec 2026-11-21-szenen-schreiben, §6).
 */
import { useCallback, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Id } from '@bookly/shared';
import { ApiError } from '../api/client';

/** Shown after a stale save; the fields then show the stored state. */
export const STALE_MESSAGE = 'Die Szene wurde inzwischen geändert. Der aktuelle Stand ist geladen.';

/** True for the server's 409 `{ error: 'stale' }` answer to a block PUT or an assignment PATCH with `revision`. */
export function isStale(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && (error.body as { error?: string } | undefined)?.error === 'stale';
}

/** Result of {@link useStaleNotice}. */
export interface StaleNotice {
  /** Render this where the message should appear. */
  notice: ReactNode;
  /** Handles a stale error (message + reload of `['book', bookId]`) and returns true; false for any other error. */
  handle: (error: unknown) => boolean;
  /** Hides the message. */
  clear: () => void;
}

/** State and rendering for the stale-save message of one book. */
export function useStaleNotice(bookId: Id): StaleNotice {
  const qc = useQueryClient();
  const [shown, setShown] = useState(false);
  const handle = useCallback(
    (error: unknown) => {
      if (!isStale(error)) return false;
      setShown(true);
      void qc.invalidateQueries({ queryKey: ['book', bookId] });
      return true;
    },
    [qc, bookId],
  );
  const clear = useCallback(() => setShown(false), []);
  const notice = shown ? (
    <p className="error" role="alert">
      {STALE_MESSAGE}
    </p>
  ) : null;
  return { notice, handle, clear };
}
