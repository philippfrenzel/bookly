/** Map filters: pure visibility computation plus per-book persistence in localStorage. */
import { overlaps, orderIndex, strandCharacters, type Book, type Id, type TimePoint, type TimeRange } from '@bookly/shared';
import { useCallback, useState } from 'react';

/** Criteria applied to the map; all active criteria are AND-combined. */
export interface MapFilter {
  mainOnly: boolean;
  openOnly: boolean;
  range: TimeRange | null;
  characterIds: Id[];
}

/** Filter inputs as the author edits them (range ends may be unset individually) plus the notes toggle. */
export interface FilterState {
  mainOnly: boolean;
  openOnly: boolean;
  fromId: Id | null;
  toId: Id | null;
  characterIds: Id[];
  showNotes: boolean;
}

/** Ids of storylines that pass every active criterion. */
export function applyFilters(book: Book, f: MapFilter): Set<Id> {
  const idx = orderIndex(book.timePoints);
  const wanted = new Set(f.characterIds);
  const visible = new Set<Id>();
  for (const s of book.storylines) {
    if (f.mainOnly && s.kind !== 'main') continue;
    if (f.openOnly && s.status !== 'open') continue;
    if (f.range && !overlaps(s.range, f.range, idx)) continue;
    if (wanted.size > 0 && ![...strandCharacters(s)].some((id) => wanted.has(id))) continue;
    visible.add(s.id);
  }
  return visible;
}

/** The filter state with nothing active. */
export function defaultFilterState(): FilterState {
  return { mainOnly: false, openOnly: false, fromId: null, toId: null, characterIds: [], showNotes: false };
}

/** True when any filter criterion (not the notes toggle) is active. */
export function hasActiveFilter(s: FilterState): boolean {
  return s.mainOnly || s.openOnly || s.fromId !== null || s.toId !== null || s.characterIds.length > 0;
}

/** Converts editable state to a MapFilter; a single range end defaults the other to book start/end. */
export function toMapFilter(s: FilterState, timePoints: TimePoint[]): MapFilter {
  const sorted = [...timePoints].sort((a, b) => a.position - b.position);
  let range: TimeRange | null = null;
  if (s.fromId || s.toId) {
    const startId = s.fromId ?? sorted[0]?.id;
    const endId = s.toId ?? sorted[sorted.length - 1]?.id;
    if (startId && endId) range = { startId, endId };
  }
  return { mainOnly: s.mainOnly, openOnly: s.openOnly, range, characterIds: s.characterIds };
}

const storageKey = (bookId: Id) => `bookly:filters:${bookId}`;

/** Reads the stored state for a book; unknown ids are dropped and any failure yields the defaults. */
export function loadFilterState(bookId: Id, book: Book): FilterState {
  const base = defaultFilterState();
  try {
    const raw = localStorage.getItem(storageKey(bookId));
    if (!raw) return base;
    const o = JSON.parse(raw) as Partial<FilterState>;
    const tps = new Set(book.timePoints.map((t) => t.id));
    const chars = new Set(book.characters.map((c) => c.id));
    return {
      mainOnly: o.mainOnly === true,
      openOnly: o.openOnly === true,
      fromId: typeof o.fromId === 'string' && tps.has(o.fromId) ? o.fromId : null,
      toId: typeof o.toId === 'string' && tps.has(o.toId) ? o.toId : null,
      characterIds: Array.isArray(o.characterIds) ? o.characterIds.filter((id): id is Id => typeof id === 'string' && chars.has(id)) : [],
      showNotes: o.showNotes === true,
    };
  } catch {
    return base;
  }
}

/** Stores the state for a book; storage failures are ignored. */
export function saveFilterState(bookId: Id, state: FilterState): void {
  try {
    localStorage.setItem(storageKey(bookId), JSON.stringify(state));
  } catch {
    // Persistence is a convenience only.
  }
}

/** Filter state for a book, loaded once from and written through to localStorage. */
export function useStoredFilters(bookId: Id, book: Book): [FilterState, (next: FilterState) => void] {
  const [state, setState] = useState(() => loadFilterState(bookId, book));
  const update = useCallback(
    (next: FilterState) => {
      setState(next);
      saveFilterState(bookId, next);
    },
    [bookId],
  );
  return [state, update];
}
