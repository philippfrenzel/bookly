/**
 * Book aggregate validation (spec section 6). Pure and shared by server and web.
 * Reference existence is checked before any range helper runs, because
 * `bounds` throws on unknown time point ids.
 */
import type { Book, Id, Section, Storyline, TimeRange } from './domain.js';
import { bounds, contains, orderIndex } from './ranges.js';

export type ValidationCode =
  | 'range_inverted'
  | 'unknown_time_point'
  | 'unknown_character'
  | 'section_on_side_strand'
  | 'section_outside_strand'
  | 'sections_overlap'
  | 'self_connection'
  | 'unknown_storyline'
  | 'empty_title';

export interface ValidationIssue { code: ValidationCode; elementId: Id; message: string }

export interface TimePointUsage { kind: 'storyline' | 'section'; id: Id; title: string }

/** Validates all invariants of a book; returns an empty list if it is valid. */
export function validateBook(book: Book): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const idx = orderIndex(book.timePoints);
  const characterIds = new Set(book.characters.map((c) => c.id));
  const storylineIds = new Set(book.storylines.map((s) => s.id));
  const add = (code: ValidationCode, elementId: Id, message: string) => issues.push({ code, elementId, message });

  /** Checks title, references and start <= end; returns true if the range is usable. */
  const checkElement = (
    el: { id: Id; title: string; range: TimeRange; characterIds: Id[] },
    label: string,
  ): boolean => {
    const name = `${label} „${el.title}“`;
    if (el.title.trim() === '') add('empty_title', el.id, `${label}: Titel fehlt.`);
    if (el.characterIds.some((c) => !characterIds.has(c))) add('unknown_character', el.id, `${name}: Figur existiert nicht.`);
    const known = idx.has(el.range.startId) && idx.has(el.range.endId);
    if (!known) {
      add('unknown_time_point', el.id, `${name}: Zeitpunkt existiert nicht.`);
      return false;
    }
    if (idx.get(el.range.startId)! > idx.get(el.range.endId)!) {
      add('range_inverted', el.id, `${name}: Beginn liegt nach dem Ende.`);
      return false;
    }
    return true;
  };

  for (const s of book.storylines) {
    const rangeOk = checkElement(s, 'Storyline');
    if (s.kind === 'side' && s.sections.length > 0) {
      for (const sec of s.sections) {
        add('section_on_side_strand', sec.id, `Abschnitt „${sec.title}“: Nebenstrang „${s.title}“ darf keine Abschnitte haben.`);
      }
    }
    const usable: Section[] = [];
    for (const sec of s.sections) {
      if (sec.storylineId !== s.id) {
        add('unknown_storyline', sec.id, `Abschnitt „${sec.title}“: gehört nicht zu Storyline „${s.title}“.`);
      }
      const secOk = checkElement(sec, 'Abschnitt');
      if (!secOk) continue;
      if (rangeOk && !contains(s.range, sec.range, idx)) {
        add('section_outside_strand', sec.id, `Abschnitt „${sec.title}“: liegt außerhalb des Zeitraums von „${s.title}“.`);
      }
      usable.push(sec);
    }
    checkSectionOverlaps(usable, s, idx, add);
  }

  for (const c of book.connections) {
    const label = `Verbindung`;
    if (c.fromId === c.toId) add('self_connection', c.id, `${label}: Start und Ziel sind dieselbe Storyline.`);
    if (!storylineIds.has(c.fromId) || !storylineIds.has(c.toId)) {
      add('unknown_storyline', c.id, `${label}: Storyline existiert nicht.`);
    }
    if (c.characterId !== null && !characterIds.has(c.characterId)) {
      add('unknown_character', c.id, `${label}: Figur existiert nicht.`);
    }
  }
  return issues;
}

/** Flags consecutive sections (sorted by start) where one ends after the next begins. */
function checkSectionOverlaps(
  sections: Section[],
  strand: Storyline,
  idx: ReturnType<typeof orderIndex>,
  add: (code: ValidationCode, elementId: Id, message: string) => void,
): void {
  const sorted = [...sections].sort((a, b) => bounds(a.range, idx)[0] - bounds(b.range, idx)[0]);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    if (bounds(a.range, idx)[1] > bounds(b.range, idx)[0]) {
      add('sections_overlap', b.id, `Abschnitte „${a.title}“ und „${b.title}“ in „${strand.title}“ überlappen sich.`);
    }
  }
}

/** Lists storylines and sections that use the time point as start or end of their range. */
export function timePointUsages(book: Book, timePointId: Id): TimePointUsage[] {
  const uses = (r: TimeRange) => r.startId === timePointId || r.endId === timePointId;
  const out: TimePointUsage[] = [];
  for (const s of book.storylines) {
    if (uses(s.range)) out.push({ kind: 'storyline', id: s.id, title: s.title });
    for (const sec of s.sections) {
      if (uses(sec.range)) out.push({ kind: 'section', id: sec.id, title: sec.title });
    }
  }
  return out;
}
