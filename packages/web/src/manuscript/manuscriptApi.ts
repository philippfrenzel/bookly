/** API hooks for the manuscript page and the German messages for its error answers. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BlockVersion, Id, LengthChoice, ManuscriptResponse, ReviewedBook } from '@bookly/shared';
import { ApiError, api } from '../api/client';

/** How often the page refreshes so locks of others and a lost own lock show up. */
export const MANUSCRIPT_POLL_MS = 20_000;

const key = (bookId: Id) => ['manuscript', bookId];

/** The manuscript of a book as the signed-in user sees it; refreshed periodically. */
export function useManuscript(bookId: Id) {
  return useQuery({
    queryKey: key(bookId),
    queryFn: () => api<ManuscriptResponse>('GET', `/api/books/${bookId}/manuscript`),
    refetchInterval: MANUSCRIPT_POLL_MS,
  });
}

/** One manuscript call: method, path below /manuscript and optional body. */
export interface ManuscriptCall {
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
}

/** Runs a manuscript mutation; its answer replaces the cached manuscript. */
export function useManuscriptMutation(bookId: Id) {
  const qc = useQueryClient();
  return useMutation<ManuscriptResponse, ApiError, ManuscriptCall>({
    mutationFn: (c) => api<ManuscriptResponse>(c.method, `/api/books/${bookId}/manuscript${c.path}`, c.body),
    onMutate: () => qc.cancelQueries({ queryKey: key(bookId) }),
    onSuccess: (res) => qc.setQueryData(key(bookId), res),
  });
}

/** All versions of a block, newest first (loaded when shown). */
export function useBlockVersions(bookId: Id, blockId: Id, enabled: boolean, version: number) {
  return useQuery({
    queryKey: ['block-versions', blockId, version],
    queryFn: () => api<BlockVersion[]>('GET', `/api/books/${bookId}/manuscript/blocks/${blockId}/versions`),
    enabled,
  });
}

/** AI prose draft for a block; nothing is saved. */
export function useBlockDraft(bookId: Id) {
  return useMutation<{ text: string }, ApiError, { blockId: Id; length: LengthChoice }>({
    mutationFn: ({ blockId, length }) => api<{ text: string }>('POST', `/api/books/${bookId}/manuscript/blocks/${blockId}/draft`, { length }),
  });
}

/** Books shared with the signed-in user as reviewer. */
export function useReviews() {
  return useQuery({ queryKey: ['reviews'], queryFn: () => api<ReviewedBook[]>('GET', '/api/reviews') });
}

const MESSAGES: Record<string, string> = {
  locked: 'Dieser Baustein wird gerade bearbeitet. Versuche es später noch einmal.',
  conflict: 'Der Baustein wurde inzwischen geändert. Lade neu und übernimm deine Änderung erneut.',
  forbidden: 'Dafür fehlt dir das Recht.',
  chapter_deleted: 'Das Kapitel liegt im Papierkorb. Stelle zuerst das Kapitel wieder her.',
  too_many_reviewers: 'Es sind schon 5 Lektoren eingetragen, mehr geht nicht.',
  user_not_found: 'Unter dieser E-Mail gibt es kein Konto. Die Person muss sich zuerst registrieren.',
  already_reviewer: 'Diese Person ist schon Lektor dieses Buchs.',
  self: 'Du bist die Autorin oder der Autor dieses Buchs.',
  ai_disabled: 'KI nicht eingerichtet.',
  ai_failed: 'Die KI hat gerade keine brauchbare Antwort geliefert. Versuche es noch einmal.',
  no_storylines: 'Lege zuerst Storylines an, dann kann die KI eine Struktur vorschlagen.',
  decided: 'Über diesen Vorschlag wurde schon entschieden.',
};

/** German message for a failed manuscript call. */
export function manuscriptError(error: unknown, fallback = 'Das hat nicht geklappt.'): string {
  if (error instanceof ApiError) {
    const code = (error.body as { error?: string } | undefined)?.error;
    if (code && MESSAGES[code]) return MESSAGES[code]!;
  }
  return fallback;
}

/** True when the error is the answer for a block someone else is editing. */
export function isLocked(error: unknown): boolean {
  return error instanceof ApiError && error.status === 423;
}
