/**
 * Pure operations on the ordered text blocks of a scene assignment. Each returns the complete list to
 * PUT (known blocks keep their id, new ones have none) or null when the operation does not apply.
 * Texts are never trimmed, so a split and its undo keep every character (spec 2026-11-21-szenen-schreiben).
 */
import { splitBlockText } from '@bookly/shared';
import type { Id } from '@bookly/shared';

/** A block as sent to the server: stored blocks carry their id, new blocks have none. */
export type DraftBlock = { id?: Id; text: string };

/** What a split produced, so it can be undone while both halves are unchanged. */
export interface SplitRecord {
  firstId: Id;
  secondId: Id;
  first: string;
  second: string;
}

/** Splits block `index` at `caret` into itself (text before) and a new block (text after); null unless the caret is strictly inside. */
export function splitAt(blocks: DraftBlock[], index: number, caret: number): DraftBlock[] | null {
  const block = blocks[index];
  const halves = block ? splitBlockText(block.text, caret) : null;
  if (!block || !halves) return null;
  return [...blocks.slice(0, index), { ...block, text: halves[0] }, { text: halves[1] }, ...blocks.slice(index + 1)];
}

/** Inserts an empty block after `index`, or at the end when `index` is null. */
export function insertAfter(blocks: DraftBlock[], index: number | null): DraftBlock[] {
  const at = index === null ? blocks.length : index + 1;
  return [...blocks.slice(0, at), { text: '' }, ...blocks.slice(at)];
}

/**
 * Joins the two halves of a split back into the first block (text `first + second`) and drops the second;
 * null when either half changed, is gone, or the halves are no longer next to each other.
 */
export function undoSplit(blocks: DraftBlock[], record: SplitRecord): DraftBlock[] | null {
  const i = blocks.findIndex((b) => b.id === record.firstId);
  const first = blocks[i];
  const second = blocks[i + 1];
  if (!first || !second || second.id !== record.secondId) return null;
  if (first.text !== record.first || second.text !== record.second) return null;
  return [...blocks.slice(0, i), { id: first.id, text: record.first + record.second }, ...blocks.slice(i + 2)];
}

/** Removes block `index` if it is empty and not the only block; null otherwise, so no text is ever lost. */
export function removeEmpty(blocks: DraftBlock[], index: number): DraftBlock[] | null {
  if (blocks.length < 2 || blocks[index]?.text !== '') return null;
  return blocks.filter((_, i) => i !== index);
}
