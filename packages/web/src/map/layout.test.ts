/** Tests for lane assignment and bar geometry of the storyline map. */
import { orderIndex, type Storyline, type TimePoint } from '@bookly/shared';
import { describe, expect, it } from 'vitest';
import { assignLanes, barGeometry, COLUMN_WIDTH, HEADER_HEIGHT, LANE_HEIGHT } from './layout';

const timePoints: TimePoint[] = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, position: i }));
const idx = orderIndex(timePoints);

function make(id: string, kind: 'main' | 'side', s: number, e: number, title = id): Storyline {
  return {
    id, title, description: '', characterIds: [], range: { startId: `t${s}`, endId: `t${e}` },
    kind, status: 'in_progress', color: '#2B59C3', note: null, sections: [],
  };
}

describe('assignLanes', () => {
  it('puts mains in the centre block and sides outside, alternating above and below', () => {
    const list = [
      make('m1', 'main', 0, 5), make('m2', 'main', 2, 6),
      make('a', 'side', 0, 3), make('b', 'side', 1, 4), make('c', 'side', 2, 5),
    ];
    const { laneOf, laneCount, mainLanes } = assignLanes(list, idx);
    expect(mainLanes).toEqual([2, 3]);
    expect(laneCount).toBe(5);
    expect(laneOf.get('m1')).toBe(2);
    expect(laneOf.get('m2')).toBe(3);
    expect(laneOf.get('a')).toBe(1); // first side lane: above, next to the mains
    expect(laneOf.get('b')).toBe(4); // second: below
    expect(laneOf.get('c')).toBe(0); // third: above, further out
  });

  it('never lets overlapping strands share a lane', () => {
    const list: Storyline[] = [];
    for (let i = 0; i < 60; i++) {
      const s = (i * 7) % 15;
      list.push(make(`s${i}`, i % 3 === 0 ? 'main' : 'side', s, s + (i % 5)));
    }
    const { laneOf } = assignLanes(list, idx);
    for (const a of list) {
      for (const b of list) {
        if (a.id >= b.id) continue;
        if (laneOf.get(a.id) !== laneOf.get(b.id)) continue;
        const [as, ae] = [Number(a.range.startId.slice(1)), Number(a.range.endId.slice(1))];
        const [bs, be] = [Number(b.range.startId.slice(1)), Number(b.range.endId.slice(1))];
        expect(as <= be && bs <= ae).toBe(false);
      }
    }
  });

  it('is deterministic regardless of input order', () => {
    const list = [make('x', 'side', 0, 2, 'Same'), make('y', 'side', 0, 2, 'Same'), make('z', 'side', 0, 2, 'Alpha')];
    const a = assignLanes(list, idx);
    const b = assignLanes([...list].reverse(), idx);
    expect([...a.laneOf.entries()].sort()).toEqual([...b.laneOf.entries()].sort());
    // ties: title first, then id
    const order = [...a.laneOf.entries()].sort((p, q) => p[1] - q[1]).map(([id]) => id);
    expect(order).toEqual(['y', 'z', 'x']);
  });

  it('lays out 500 storylines under 100 ms', () => {
    const list: Storyline[] = [];
    for (let i = 0; i < 500; i++) list.push(make(`s${i}`, i % 4 === 0 ? 'main' : 'side', i % 15, (i % 15) + (i % 5)));
    const t0 = performance.now();
    assignLanes(list, idx);
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it('handles no storylines', () => {
    expect(assignLanes([], idx)).toEqual({ laneOf: new Map(), laneCount: 0, mainLanes: [0, -1] });
  });
});

describe('barGeometry', () => {
  it('spans from the start column left edge to the end column right edge', () => {
    const g = barGeometry(make('a', 'main', 2, 4), 1, idx);
    expect(g.x).toBe(2 * COLUMN_WIDTH);
    expect(g.width).toBe(3 * COLUMN_WIDTH);
    expect(g.y).toBe(HEADER_HEIGHT + LANE_HEIGHT * 1.5);
  });
});
