/**
 * Story time range semantics (spec section 6). Ranges are inclusive and all
 * comparisons use the index in the position-sorted time point list, so gaps
 * between position values never matter.
 */
import type { Id, TimePoint, TimeRange } from './domain.js';

export type OrderIndex = Map<Id, number>;

/** Maps each time point id to its index in the position-sorted list. */
export function orderIndex(timePoints: TimePoint[]): OrderIndex {
  const sorted = [...timePoints].sort((a, b) => a.position - b.position);
  return new Map(sorted.map((t, i) => [t.id, i]));
}

/** Returns the [start, end] indices of a range, ordered ascending. */
export function bounds(r: TimeRange, idx: OrderIndex): [number, number] {
  const s = idx.get(r.startId);
  const e = idx.get(r.endId);
  if (s === undefined || e === undefined) throw new Error('Unknown time point in range');
  return s <= e ? [s, e] : [e, s];
}

/** True if the ranges share at least one time point (a shared endpoint counts). */
export function overlaps(a: TimeRange, b: TimeRange, idx: OrderIndex): boolean {
  const [as, ae] = bounds(a, idx);
  const [bs, be] = bounds(b, idx);
  return as <= be && bs <= ae;
}

/** True if the ranges overlap or their endpoints are neighbours in the order. */
export function touches(a: TimeRange, b: TimeRange, idx: OrderIndex): boolean {
  const [as, ae] = bounds(a, idx);
  const [bs, be] = bounds(b, idx);
  return as <= be + 1 && bs <= ae + 1;
}

/** True if `a` ends strictly before `b` starts. */
export function isBefore(a: TimeRange, b: TimeRange, idx: OrderIndex): boolean {
  return bounds(a, idx)[1] < bounds(b, idx)[0];
}

/** True if `inner` lies fully within `outer` (inclusive). */
export function contains(outer: TimeRange, inner: TimeRange, idx: OrderIndex): boolean {
  const [os, oe] = bounds(outer, idx);
  const [is, ie] = bounds(inner, idx);
  return os <= is && ie <= oe;
}
