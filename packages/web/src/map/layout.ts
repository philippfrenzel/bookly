/** Pure layout for the storyline map: lane assignment and bar geometry. */
import { bounds, type Id, type OrderIndex, type Storyline } from '@bookly/shared';

export const COLUMN_WIDTH = 160;
export const LANE_HEIGHT = 48;
export const HEADER_HEIGHT = 40;

/** Lane per storyline; lane 0 is the top lane. `mainLanes` is the inclusive [first, last] centre block. */
export interface LaneLayout {
  laneOf: Map<Id, number>;
  laneCount: number;
  mainLanes: [number, number];
}

/** Greedy interval packing; returns the packing lane (0-based) of each storyline in input order. */
function pack(list: Storyline[], idx: OrderIndex): { lanes: Map<Id, number>; count: number } {
  const keyed = list.map((s) => ({ s, b: bounds(s.range, idx) }));
  keyed.sort(
    (a, b) =>
      a.b[0] - b.b[0] ||
      b.b[1] - a.b[1] ||
      a.s.title.localeCompare(b.s.title) ||
      (a.s.id < b.s.id ? -1 : a.s.id > b.s.id ? 1 : 0),
  );
  const laneEnds: number[] = [];
  const lanes = new Map<Id, number>();
  for (const { s, b } of keyed) {
    let lane = laneEnds.findIndex((end) => end < b[0]);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b[1]);
    } else {
      laneEnds[lane] = b[1];
    }
    lanes.set(s.id, lane);
  }
  return { lanes, count: laneEnds.length };
}

/**
 * Assigns lanes: mains form a contiguous centre block, side lanes alternate
 * above (first, next to the mains) and below. Deterministic for equal input.
 */
export function assignLanes(storylines: Storyline[], idx: OrderIndex): LaneLayout {
  const mains = pack(storylines.filter((s) => s.kind === 'main'), idx);
  const sides = pack(storylines.filter((s) => s.kind === 'side'), idx);
  const above = Math.ceil(sides.count / 2);
  const mainStart = above;
  const belowStart = above + mains.count;
  const laneOf = new Map<Id, number>();
  for (const [id, lane] of mains.lanes) laneOf.set(id, mainStart + lane);
  for (const [id, lane] of sides.lanes) {
    laneOf.set(id, lane % 2 === 0 ? above - 1 - lane / 2 : belowStart + (lane - 1) / 2);
  }
  return { laneOf, laneCount: above + mains.count + Math.floor(sides.count / 2), mainLanes: [mainStart, belowStart - 1] };
}

/** Left edge, vertical centre of the lane and width of a storyline bar (before visual insets). */
export function barGeometry(s: Storyline, lane: number, idx: OrderIndex): { x: number; y: number; width: number } {
  const [start, end] = bounds(s.range, idx);
  return {
    x: start * COLUMN_WIDTH,
    y: HEADER_HEIGHT + lane * LANE_HEIGHT + LANE_HEIGHT / 2,
    width: (end - start + 1) * COLUMN_WIDTH,
  };
}
