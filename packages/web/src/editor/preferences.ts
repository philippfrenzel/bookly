/**
 * Writing aids the author can switch on or off (wand menu): reviewer hints and the typing assistant.
 * Remembered per browser in localStorage; every ProseField follows changes at once.
 */
import { useSyncExternalStore } from 'react';

/** Switchable writing aids. */
export interface EditorPrefs {
  /** Wavy underlines for filler words and repetitions (local, no AI request). */
  hints: boolean;
  /** Grey continuation after a pause in typing (one AI request per pause). */
  ghost: boolean;
}

const KEY = 'bookly.editor';
const DEFAULTS: EditorPrefs = { hints: true, ghost: false };

function load(): EditorPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<EditorPrefs>) : {};
    return {
      hints: typeof stored.hints === 'boolean' ? stored.hints : DEFAULTS.hints,
      ghost: typeof stored.ghost === 'boolean' ? stored.ghost : DEFAULTS.ghost,
    };
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

/** Current preferences (outside React). */
export function editorPrefs(): EditorPrefs {
  return current;
}

/** Changes one preference, stores it and notifies every field. */
export function setEditorPref<K extends keyof EditorPrefs>(key: K, value: EditorPrefs[K]): void {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable (private mode): the choice holds for this page only.
  }
  for (const fn of listeners) fn();
}

/** Re-reads storage; for tests. */
export function resetEditorPrefs(): void {
  current = load();
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The preferences, re-rendering when they change. */
export function useEditorPrefs(): EditorPrefs {
  return useSyncExternalStore(subscribe, editorPrefs);
}
