/** Tests for the grouped word diff used to show AI suggestions as changes. */
import { describe, expect, it } from 'vitest';
import { wordDiff } from './wordDiff';

const side = (ops: ReturnType<typeof wordDiff>, keep: 'del' | 'ins') => ops.filter((o) => o.type === 'eq' || o.type === keep).map((o) => o.text).join('');

describe('wordDiff', () => {
  it('returns one equal op for identical texts', () => {
    expect(wordDiff('Mira geht.', 'Mira geht.')).toEqual([{ type: 'eq', text: 'Mira geht.' }]);
  });

  it('marks a replaced word', () => {
    expect(wordDiff('Das Meer war schwarz.', 'Das Wasser war schwarz.')).toEqual([
      { type: 'eq', text: 'Das ' },
      { type: 'del', text: 'Meer' },
      { type: 'ins', text: 'Wasser' },
      { type: 'eq', text: ' war schwarz.' },
    ]);
  });

  it('groups a rewritten phrase into one deletion and one insertion', () => {
    const ops = wordDiff('Sie dachte an Jakob.', 'Ihre Gedanken wanderten zu Jakob.');
    expect(ops).toEqual([
      { type: 'del', text: 'Sie dachte an ' },
      { type: 'ins', text: 'Ihre Gedanken wanderten zu ' },
      { type: 'eq', text: 'Jakob.' },
    ]);
  });

  it('handles pure insertion and pure deletion', () => {
    expect(wordDiff('', 'Neu.')).toEqual([{ type: 'ins', text: 'Neu.' }]);
    expect(wordDiff('Weg.', '')).toEqual([{ type: 'del', text: 'Weg.' }]);
  });

  it('keeps both sides reconstructible', () => {
    const a = 'Der Sturm hatte eigentlich schon begonnen, aber erst jetzt schlugen die Wellen.';
    const b = 'Der Sturm hatte schon begonnen. Erst jetzt krachten die Wellen.';
    const ops = wordDiff(a, b);
    expect(side(ops, 'del')).toBe(a);
    expect(side(ops, 'ins')).toBe(b);
  });
});
