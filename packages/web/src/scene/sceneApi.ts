/** Scene-specific API hooks: image upload with its German error texts and the AI scene description. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SCENE_IMAGE_MAX_BYTES, SCENE_IMAGE_TYPES } from '@bookly/shared';
import type { BookResponse, Id, SceneDescriptionResult } from '@bookly/shared';
import { ApiError, api, uploadFile } from '../api/client';

/** URL of a scene's stored image; the version makes a replaced image load fresh. */
export function sceneImageUrl(bookId: Id, sceneId: Id, version: string): string {
  return `/api/books/${bookId}/scenes/${sceneId}/image?v=${encodeURIComponent(version)}`;
}

/** Message for a file the browser can already tell is not acceptable, or null when it may be sent. */
export function imageProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(SCENE_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'Nur JPEG-, PNG- oder WebP-Bilder.';
  if (file.size > SCENE_IMAGE_MAX_BYTES) return 'Das Bild ist zu groß (höchstens 5 MB).';
  return null;
}

/** German message for a failed upload response. */
export function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 413) return 'Das Bild ist zu groß (höchstens 5 MB).';
  if (error instanceof ApiError && error.status === 415) return 'Nur JPEG-, PNG- oder WebP-Bilder.';
  return 'Bild konnte nicht gespeichert werden.';
}

/** Uploads (or replaces) a scene image; the response replaces the cached book. */
export function useUploadSceneImage(bookId: Id) {
  const qc = useQueryClient();
  return useMutation<BookResponse, ApiError, { sceneId: Id; file: File }>({
    mutationFn: (v) => uploadFile<BookResponse>('PUT', `/api/books/${bookId}/scenes/${v.sceneId}/image`, v.file),
    onMutate: () => qc.cancelQueries({ queryKey: ['book', bookId] }),
    onSuccess: (res) => qc.setQueryData(['book', bookId], res),
  });
}

/** German message for a failed description request. */
export function descriptionErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) return 'Die Szene braucht ein Bild oder eine Notiz.';
  if (error instanceof ApiError && error.status === 503) return 'KI nicht eingerichtet.';
  return 'Beschreibung fehlgeschlagen.';
}

/** Asks the AI for a scene description from the scene's image and notes (FR-004); nothing is saved. */
export function useSceneDescription(bookId: Id) {
  return useMutation<SceneDescriptionResult, ApiError, { sceneId: Id; sectionId: Id | null }>({
    mutationFn: (v) => api<SceneDescriptionResult>('POST', `/api/books/${bookId}/scenes/${v.sceneId}/description`, { sectionId: v.sectionId }),
  });
}
