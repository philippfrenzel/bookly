/**
 * One connection drawn as an interchange: a cased transfer path from the end of line A to the start
 * of line B, with interchange rings at both ends, a type glyph in a pill, the label and, when the
 * connection has hints, a warning glyph (signal red while open). Red is reserved for contradictions.
 */
import type { Connection, Hint, OrderIndex, Storyline } from '@bookly/shared';
import type { KeyboardEvent } from 'react';
import { TypeGlyph, WarningGlyph } from './icons';
import { barGeometry } from './layout';

const INSET = 6;
const RING_R = 6;

interface Props {
  connection: Connection;
  from: Storyline;
  to: Storyline;
  fromLane: number;
  toLane: number;
  idx: OrderIndex;
  /** Hints of this connection only. */
  hints: Hint[];
  /** Lane pitch in px (see laneHeightFor). */
  laneHeight?: number;
  /** Another line is highlighted and this connection does not touch it. */
  dimmed?: boolean;
  /**
   * Which layer to draw: the focusable path (under the lines), the markers (type pill, label, warning;
   * drawn over the lines so they are never hidden), or both.
   */
  part?: 'path' | 'markers' | 'both';
  onSelect: (id: string) => void;
}

/** Furthest a backwards connection's markers sit from its source end, in px, so its label stays clear of the target end. */
const BACKWARD_MARKER_REACH = 140;
/** How far a backwards connection leaves its source lane before running back, in px: inside the gap between lanes, never on the next lane. */
const LANE_GAP_OFFSET = 30;
/** Distance of a vertical connection's markers from the target lane, in px: the centre of the gap before it. */
const MARKER_GAP_OFFSET = 38;
/** Corner radius of the plan's bends, in px. */
const CORNER = 8;

export interface Point { x: number; y: number }

/**
 * Octilinear route of a connection, as on a network plan: every segment is horizontal, vertical or
 * at 45 degrees. Forward connections leave and enter horizontally with one 45-degree diagonal (or a
 * vertical drop when too steep for one). Backwards connections turn off the source end into the lane gap,
 * run back and turn onto the target start, staying exactly within the x-range of their endpoints.
 */
export function connectionRoute(x1: number, y1: number, x2: number, y2: number): Point[] {
  const dy = y2 - y1;
  if (x2 >= x1) {
    if (Math.abs(dy) < 1) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    const mid = (x1 + x2) / 2;
    if (x2 - x1 >= Math.abs(dy) + 2 * CORNER) {
      const half = Math.abs(dy) / 2;
      return [{ x: x1, y: y1 }, { x: mid - half, y: y1 }, { x: mid + half, y: y2 }, { x: x2, y: y2 }];
    }
    return [{ x: x1, y: y1 }, { x: mid, y: y1 }, { x: mid, y: y2 }, { x: x2, y: y2 }];
  }
  const ym = backwardRunY(y1, y2);
  return [{ x: x1, y: y1 }, { x: x1, y: ym }, { x: x2, y: ym }, { x: x2, y: y2 }];
}

/** Height of a backwards connection's return run: the lane gap next to the source lane. */
function backwardRunY(y1: number, y2: number): number {
  return y1 + (y2 - y1 < -1 ? -LANE_GAP_OFFSET : LANE_GAP_OFFSET);
}

/** SVG path for a polyline with rounded corners (radius clamped to half the shorter adjacent segment). */
export function roundedPath(points: Point[], r: number = CORNER): string {
  if (points.length < 2) return '';
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1]!, points[i]!, points[i + 1]!];
    const lenIn = Math.hypot(b.x - a.x, b.y - a.y);
    const lenOut = Math.hypot(c.x - b.x, c.y - b.y);
    const k = Math.min(r, lenIn / 2, lenOut / 2);
    const p = { x: b.x - ((b.x - a.x) / (lenIn || 1)) * k, y: b.y - ((b.y - a.y) / (lenIn || 1)) * k };
    const q = { x: b.x + ((c.x - b.x) / (lenOut || 1)) * k, y: b.y + ((c.y - b.y) / (lenOut || 1)) * k };
    d += ` L ${p.x} ${p.y} Q ${b.x} ${b.y} ${q.x} ${q.y}`;
  }
  const last = points[points.length - 1]!;
  return `${d} L ${last.x} ${last.y}`;
}

/** Path data of a connection from (x1,y1) to (x2,y2). */
export function connectionPathD(x1: number, y1: number, x2: number, y2: number): string {
  return roundedPath(connectionRoute(x1, y1, x2, y2));
}

/**
 * Point on the route where the markers sit: on its longest segment. A segment that crosses other lanes
 * carries its markers in the gap just before the target lane, so they never sit on a line in between.
 */
export function connectionMarkerPoint(x1: number, y1: number, x2: number, y2: number): Point {
  if (x2 < x1) return { x: Math.max((x1 + x2) / 2, x1 - BACKWARD_MARKER_REACH), y: backwardRunY(y1, y2) };
  const pts = connectionRoute(x1, y1, x2, y2);
  let best = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  let bestLen = -1;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1]!, pts[i]!];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len <= bestLen) continue;
    bestLen = len;
    const dy = b.y - a.y;
    if (Math.abs(dy) > 2 * MARKER_GAP_OFFSET) {
      const y = b.y - Math.sign(dy) * MARKER_GAP_OFFSET;
      best = { x: a.x + ((b.x - a.x) * (y - a.y)) / dy, y };
    } else {
      best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return best;
}

/** Focusable interchange path with rings, type glyph, label and a warning glyph when hints exist. */
export function ConnectionPath({ connection: c, from, to, fromLane, toLane, idx, hints, laneHeight, dimmed = false, part = 'both', onSelect }: Props) {
  const a = barGeometry(from, fromLane, idx, laneHeight);
  const b = barGeometry(to, toLane, idx, laneHeight);
  const x1 = a.x + a.width - INSET;
  const y1 = a.y;
  const x2 = b.x + INSET;
  const y2 = b.y;
  const { x: mx, y: my } = connectionMarkerPoint(x1, y1, x2, y2);
  const d = connectionPathD(x1, y1, x2, y2);
  const open = hints.some((h) => !h.acknowledged);
  const warned = hints.length > 0;

  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(c.id);
    }
  };

  const hintState = !warned ? 'none' : open ? 'open' : 'acknowledged';
  const markers = (
    <>
      <TypeGlyph type={c.type} x={mx} y={my} />
      {c.label && (
        <text className="connection-label" x={mx + (warned ? 36 : 16)} y={my} dominantBaseline="central">
          {c.label}
        </text>
      )}
      {warned && <WarningGlyph x={mx + 22} y={my - 1} open={open} />}
    </>
  );

  if (part === 'markers') {
    // Mouse shortcut onto the same connection; keyboard users reach it through the path's button.
    return (
      <g className={`connection-markers${dimmed ? ' is-dimmed' : ''}`} data-hint-state={hintState} aria-hidden="true" onClick={() => onSelect(c.id)}>
        {markers}
      </g>
    );
  }

  return (
    <g
      className={`connection-path${dimmed ? ' is-dimmed' : ''}`}
      data-hint-state={hintState}
      role="button"
      tabIndex={0}
      aria-label={`Verbindung „${from.title}“ → „${to.title}“`}
      onClick={() => onSelect(c.id)}
      onKeyDown={onKeyDown}
    >
      <path className="connection-hit" d={d} fill="none" stroke="transparent" strokeWidth={16} />
      <path className="connection-casing" d={d} fill="none" />
      <path className="connection-line" d={d} fill="none" markerEnd="url(#connection-arrow)" />
      <circle className="interchange" cx={x1} cy={y1} r={RING_R} />
      <circle className="interchange" cx={x2} cy={y2} r={RING_R} />
      {part === 'both' && markers}
    </g>
  );
}

const STUB_LENGTH = 24;

interface StubProps {
  /** The visible storyline of the connection. */
  visible: Storyline;
  lane: number;
  idx: OrderIndex;
  laneHeight?: number;
  /** Whether the visible storyline is the connection's source (stub leaves its end) or target (stub enters its start). */
  visibleIs: 'from' | 'to';
}

/** Short dashed line from the visible end of a connection whose other storyline is filtered out. */
export function ConnectionStub({ visible, lane, idx, laneHeight, visibleIs }: StubProps) {
  const g = barGeometry(visible, lane, idx, laneHeight);
  const x = visibleIs === 'from' ? g.x + g.width - INSET : g.x + INSET;
  const x2 = visibleIs === 'from' ? x + STUB_LENGTH : x - STUB_LENGTH;
  return (
    <g className="connection-stub" role="img" aria-label="Verbindung zu ausgeblendeter Storyline">
      <title>Verbindung zu ausgeblendeter Storyline</title>
      <line x1={x} y1={g.y} x2={x2} y2={g.y} strokeDasharray="4 3" />
    </g>
  );
}
