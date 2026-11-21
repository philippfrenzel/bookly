/** Domain types and visual constants shared by server and web. */
import type { CharacterCriterion } from './criteria.js';
import type { Hint } from './hints.js';

export type Id = string; // uuid
export type StorylineKind = 'main' | 'side';
export type StorylineStatus = 'in_progress' | 'completed' | 'open';
export type ConnectionType = 'character_switch' | 'time_jump' | 'merge' | 'flashback';

export interface TimePoint { id: Id; name: string; position: number }
/** Character profile; every field is optional free text. */
export interface Character {
  id: Id;
  name: string | null;
  description: string | null;
  behavior: string | null;
  intentions: string | null;
}

/** Per storyline–character addition to the base profile (null when empty). */
export interface CharacterAddition { characterId: Id; behavior: string | null; intentions: string | null }
export interface TimeRange { startId: Id; endId: Id }

export interface Section {
  id: Id;
  storylineId: Id;
  title: string;
  description: string;
  characterIds: Id[];
  range: TimeRange;
  note: string | null;
  order: number;
}

export interface Storyline {
  id: Id;
  title: string;
  description: string;
  characterIds: Id[];
  range: TimeRange;
  kind: StorylineKind;
  status: StorylineStatus;
  color: string;
  note: string | null;
  additions: CharacterAddition[];
  sections: Section[];
}

export interface Connection {
  id: Id;
  fromId: Id;
  toId: Id;
  type: ConnectionType;
  label: string | null;
  characterId: Id | null;
}

export type HintRule =
  | 'time_jump_order'
  | 'merge_no_contact'
  | 'flashback_order'
  | 'switch_character_missing'
  | 'switch_character_not_in_both'
  | 'character_overlap';

export interface Acknowledgement { connectionId: Id; rule: HintRule; characterId: Id | null }

export interface Book {
  id: Id;
  title: string;
  timePoints: TimePoint[];
  characters: Character[];
  storylines: Storyline[];
  connections: Connection[];
  acknowledgements: Acknowledgement[];
}

/** Authenticated user as returned by /api/auth/*. */
export interface SessionUser { id: Id; email: string; displayName: string }

/** One storyline as drawn in a book card's preview: colour, kind and its span as 0–1 fractions of the time axis. */
export interface BookLinePreview { color: string; kind: StorylineKind; start: number; end: number }

/** Entry of the book list. `updatedAt` is an ISO timestamp of the last change to the book. */
export interface BookSummary {
  id: Id;
  title: string;
  storylineCount: number;
  characterCount: number;
  updatedAt: string;
  lines: BookLinePreview[];
}

/** AI warning about a contradiction between a storyline and a character. */
export interface CharacterWarning {
  id: Id;
  storylineId: Id;
  characterId: Id;
  criterion: CharacterCriterion;
  message: string;
  acknowledged: boolean;
}

export type CheckStatus = 'pending' | 'running' | 'done' | 'failed';

/** State of the latest AI check of one storyline. */
export interface CharacterCheck {
  storylineId: Id;
  status: CheckStatus;
  finishedAt: string | null;
  error: string | null;
}

/** Book aggregate plus hints, AI warnings and check states, returned by every book endpoint. */
export interface BookResponse {
  book: Book;
  hints: Hint[];
  characterWarnings: CharacterWarning[];
  characterChecks: CharacterCheck[];
  ai: { enabled: boolean };
}

/** Label, color and symbol used to display each storyline status. */
export const STATUS_STYLE: Record<StorylineStatus, { label: string; color: string; symbol: string }> = {
  in_progress: { label: 'in Bearbeitung', color: '#D98E04', symbol: '✎' },
  completed: { label: 'abgeschlossen', color: '#2E8B57', symbol: '✓' },
  open: { label: 'bewusst offen', color: '#7B5EA7', symbol: '○' },
};

/** Default strand color per storyline kind. */
export const KIND_DEFAULT_COLOR: Record<StorylineKind, string> = {
  main: '#2B59C3',
  side: '#8A94A6',
};
