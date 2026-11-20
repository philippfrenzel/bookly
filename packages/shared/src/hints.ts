/**
 * Contradiction hints for connections (spec section 7). Pure functions: hints
 * are always computed, never stored; only acknowledgements are persisted.
 * Assumes the book already passed validation, so all references exist.
 */
import type { Acknowledgement, Book, Connection, HintRule, Id, Storyline } from './domain.js';
import { bounds, orderIndex, overlaps, touches } from './ranges.js';

export interface Hint {
  connectionId: Id;
  rule: HintRule;
  characterId: Id | null;
  message: string;
  acknowledged: boolean;
}

/** Stable identity of a hint: connection + rule + character (if any). */
export function hintKey(h: { connectionId: Id; rule: HintRule; characterId: Id | null }): string {
  return `${h.connectionId}:${h.rule}:${h.characterId ?? ''}`;
}

/** Characters of a strand: the storyline's own plus those of all its sections. */
export function strandCharacters(s: Storyline): Set<Id> {
  const ids = new Set<Id>(s.characterIds);
  for (const sec of s.sections) for (const id of sec.characterIds) ids.add(id);
  return ids;
}

/** Computes the hints of one connection (all unacknowledged): order rule, switch rules, then overlaps by character name. */
export function checkConnection(book: Book, c: Connection): Hint[] {
  const a = book.storylines.find((s) => s.id === c.fromId);
  const b = book.storylines.find((s) => s.id === c.toId);
  if (!a || !b) return [];
  const idx = orderIndex(book.timePoints);
  const nameOf = (id: Id) => book.characters.find((ch) => ch.id === id)?.name ?? id;
  const hints: Hint[] = [];
  const add = (rule: HintRule, characterId: Id | null, message: string) =>
    hints.push({ connectionId: c.id, rule, characterId, message, acknowledged: false });

  const [aStart, aEnd] = bounds(a.range, idx);
  const [bStart] = bounds(b.range, idx);
  const charsA = strandCharacters(a);
  const charsB = strandCharacters(b);

  if (c.type === 'time_jump' && bStart <= aEnd) {
    add('time_jump_order', null, `Zeitsprung: „${b.title}“ beginnt nicht nach dem Ende von „${a.title}“.`);
  } else if (c.type === 'merge' && !touches(a.range, b.range, idx)) {
    add('merge_no_contact', null, `Vereinigung: „${a.title}“ und „${b.title}“ berühren sich zeitlich nicht.`);
  } else if (c.type === 'flashback' && bStart >= aStart) {
    add('flashback_order', null, `Rückblende: „${b.title}“ liegt nicht vor dem Beginn von „${a.title}“.`);
  } else if (c.type === 'character_switch') {
    if (c.characterId === null) {
      add('switch_character_missing', null, 'Figur wechselt: Figur fehlt.');
    } else if (!charsA.has(c.characterId) || !charsB.has(c.characterId)) {
      add('switch_character_not_in_both', c.characterId,
        `Figur wechselt: „${nameOf(c.characterId)}“ ist nicht in „${a.title}“ und „${b.title}“ eingetragen.`);
    }
  }

  if (c.type !== 'merge' && overlaps(a.range, b.range, idx)) {
    const exempt = c.type === 'character_switch' ? c.characterId : null;
    const shared = [...charsA]
      .filter((id) => charsB.has(id) && id !== exempt)
      .sort((x, y) => nameOf(x).localeCompare(nameOf(y)) || x.localeCompare(y));
    for (const id of shared) {
      add('character_overlap', id, `„${nameOf(id)}“ ist zur selben Zeit in „${a.title}“ und „${b.title}“ eingetragen.`);
    }
  }
  return hints;
}

/** Computes hints for every connection in book order, flagging acknowledged ones. */
export function checkBook(book: Book): Hint[] {
  const acked = new Set(book.acknowledgements.map(hintKey));
  return book.connections.flatMap((c) =>
    checkConnection(book, c).map((h) => ({ ...h, acknowledged: acked.has(hintKey(h)) })),
  );
}

/** Acknowledgements whose hint no longer exists (their cause was fixed). */
export function staleAcknowledgements(book: Book): Acknowledgement[] {
  const current = new Set(checkBook(book).map(hintKey));
  return book.acknowledgements.filter((a) => !current.has(hintKey(a)));
}
