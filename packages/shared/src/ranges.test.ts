/** Tests for inclusive story-time range semantics (spec section 6). */
import { describe, expect, test } from 'vitest';
import type { TimePoint, TimeRange } from './domain.js';
import { bounds, contains, isBefore, orderIndex, overlaps, touches } from './ranges.js';

// Positions have gaps (10,20,...) on purpose: only order may matter.
const tp = (n: number): TimePoint => ({ id: `T${n}`, name: `T${n}`, position: (n + 1) * 10 });
const points = [0, 1, 2, 3, 4].map(tp);
const idx = orderIndex(points);
const r = (startId: string, endId: string): TimeRange => ({ startId, endId });

describe('range semantics', () => {
  test('shared endpoint overlaps', () => expect(overlaps(r('T0', 'T2'), r('T2', 'T3'), idx)).toBe(true));
  test('disjoint does not overlap', () => expect(overlaps(r('T0', 'T1'), r('T2', 'T3'), idx)).toBe(false));
  test('neighbours touch', () => expect(touches(r('T0', 'T1'), r('T2', 'T3'), idx)).toBe(true));
  test('gap does not touch', () => expect(touches(r('T0', 'T0'), r('T2', 'T3'), idx)).toBe(false));
  test('before is strict', () => {
    expect(isBefore(r('T0', 'T1'), r('T2', 'T2'), idx)).toBe(true);
    expect(isBefore(r('T0', 'T2'), r('T2', 'T3'), idx)).toBe(false);
  });
  test('contains inclusive', () => expect(contains(r('T0', 'T4'), r('T0', 'T4'), idx)).toBe(true));
  test('contains rejects a range sticking out', () =>
    expect(contains(r('T1', 'T3'), r('T0', 'T2'), idx)).toBe(false));
  test('bounds are ordered even for reversed input', () =>
    expect(bounds(r('T3', 'T1'), idx)).toEqual([1, 3]));
  test('unsorted input is ordered by position', () => {
    const shuffled = orderIndex([points[3]!, points[0]!, points[4]!, points[2]!, points[1]!]);
    expect(shuffled.get('T0')).toBe(0);
    expect(shuffled.get('T4')).toBe(4);
    expect(overlaps(r('T0', 'T2'), r('T2', 'T3'), shuffled)).toBe(true);
    expect(touches(r('T0', 'T1'), r('T2', 'T3'), shuffled)).toBe(true);
    expect(touches(r('T0', 'T0'), r('T2', 'T3'), shuffled)).toBe(false);
  });
});
