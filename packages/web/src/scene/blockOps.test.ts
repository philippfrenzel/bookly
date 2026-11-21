/** Tests for the pure scene block operations: exact split, insert, undo split, remove empty block. */
import { describe, expect, it } from 'vitest';
import { insertAfter, removeEmpty, splitAt, undoSplit } from './blockOps';
import type { DraftBlock } from './blockOps';

const blocks: DraftBlock[] = [
  { id: 'a', text: 'Mira sagt: Hallo.' },
  { id: 'b', text: '' },
  { id: 'c', text: ' Ende \n' },
];

describe('splitAt', () => {
  it('splits exactly at the caret, keeps every character and leaves the other blocks alone', () => {
    const out = splitAt(blocks, 0, 11)!;
    expect(out).toEqual([{ id: 'a', text: 'Mira sagt: ' }, { text: 'Hallo.' }, { id: 'b', text: '' }, { id: 'c', text: ' Ende \n' }]);
    expect(out[0]!.text + out[1]!.text).toBe(blocks[0]!.text);
  });

  it('keeps whitespace and newlines on both sides (no trim)', () => {
    expect(splitAt(blocks, 2, 5)).toEqual([blocks[0], blocks[1], { id: 'c', text: ' Ende' }, { text: ' \n' }]);
  });

  it('is null at the start, at the end, for an empty block and for an unknown index', () => {
    expect(splitAt(blocks, 0, 0)).toBeNull();
    expect(splitAt(blocks, 0, blocks[0]!.text.length)).toBeNull();
    expect(splitAt(blocks, 1, 0)).toBeNull();
    expect(splitAt(blocks, 5, 1)).toBeNull();
  });

  it('does not change its input', () => {
    const copy = structuredClone(blocks);
    splitAt(blocks, 0, 3);
    expect(blocks).toEqual(copy);
  });
});

describe('insertAfter', () => {
  it('inserts an empty block after the given index', () => {
    expect(insertAfter(blocks, 0)).toEqual([blocks[0], { text: '' }, blocks[1], blocks[2]]);
  });

  it('appends at the end without an index', () => {
    expect(insertAfter(blocks, null)).toEqual([...blocks, { text: '' }]);
  });
});

describe('undoSplit', () => {
  const split: DraftBlock[] = [{ id: 'a', text: 'Mira sagt: ' }, { id: 'n', text: 'Hallo.' }, { id: 'c', text: 'x' }];
  const record = { firstId: 'a', secondId: 'n', first: 'Mira sagt: ', second: 'Hallo.' };

  it('joins both halves back into the first block and drops the second', () => {
    expect(undoSplit(split, record)).toEqual([{ id: 'a', text: 'Mira sagt: Hallo.' }, { id: 'c', text: 'x' }]);
  });

  it('is null when either half changed', () => {
    expect(undoSplit([{ ...split[0]!, text: 'Mira sagt:' }, split[1]!, split[2]!], record)).toBeNull();
    expect(undoSplit([split[0]!, { ...split[1]!, text: 'Hallo!' }, split[2]!], record)).toBeNull();
  });

  it('is null when a half is gone or the halves are no longer next to each other', () => {
    expect(undoSplit([split[0]!, split[2]!], record)).toBeNull();
    expect(undoSplit([split[0]!, { text: '' }, split[1]!], record)).toBeNull();
  });
});

describe('removeEmpty', () => {
  it('removes an empty block', () => {
    expect(removeEmpty(blocks, 1)).toEqual([blocks[0], blocks[2]]);
  });

  it('is null for a block with text, even whitespace, and for the only block', () => {
    expect(removeEmpty(blocks, 0)).toBeNull();
    expect(removeEmpty(blocks, 2)).toBeNull();
    expect(removeEmpty([{ id: 'x', text: '' }], 0)).toBeNull();
  });
});
