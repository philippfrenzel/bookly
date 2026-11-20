/** One connection drawn as a cubic curve from the end of strand A to the start of strand B. */
import type { Connection, ConnectionType, Hint, OrderIndex, Storyline } from '@bookly/shared';
import type { KeyboardEvent } from 'react';
import { barGeometry } from './layout';

const INSET = 6;
const WARNING_COLOR = '#D98E04';
const MUTED_COLOR = '#9AA1AD';

const TYPE_ICON: Record<ConnectionType, string> = {
  time_jump: '⏩',
  flashback: '⏪',
  merge: '⋈',
  character_switch: '⇄',
};

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
  onSelect: (id: string) => void;
}

/** Horizontal overshoot allowed for backwards connections, in px. */
const BACKWARD_MARGIN = 40;

/**
 * Cubic path from (x1,y1) to (x2,y2). Forward connections leave and enter horizontally. Backwards ones
 * (target left of the source) use an S-curve whose control points stay within min/max x of the endpoints
 * plus BACKWARD_MARGIN, so the curve never leaves the content area; same-lane backwards curves bulge downwards.
 */
export function connectionPathD(x1: number, y1: number, x2: number, y2: number): string {
  if (x2 >= x1) {
    const pull = Math.max(40, (x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + pull} ${y1}, ${x2 - pull} ${y2}, ${x2} ${y2}`;
  }
  const bulge = Math.abs(y2 - y1) < 24 ? 24 : 0;
  const my = (y1 + y2) / 2 + bulge;
  return `M ${x1} ${y1} C ${x1 + BACKWARD_MARGIN} ${my}, ${x2 - BACKWARD_MARGIN} ${my}, ${x2} ${y2}`;
}

/** Focusable path with arrowhead, type icon, label and a warning triangle when hints exist. */
export function ConnectionPath({ connection: c, from, to, fromLane, toLane, idx, hints, laneHeight, onSelect }: Props) {
  const a = barGeometry(from, fromLane, idx, laneHeight);
  const b = barGeometry(to, toLane, idx, laneHeight);
  const x1 = a.x + a.width - INSET;
  const y1 = a.y;
  const x2 = b.x + INSET;
  const y2 = b.y;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const d = connectionPathD(x1, y1, x2, y2);
  const open = hints.some((h) => !h.acknowledged);
  const warned = hints.length > 0;

  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(c.id);
    }
  };

  return (
    <g
      className="connection-path"
      data-hint-state={!warned ? 'none' : open ? 'open' : 'acknowledged'}
      role="button"
      tabIndex={0}
      aria-label={`Verbindung „${from.title}“ → „${to.title}“`}
      onClick={() => onSelect(c.id)}
      onKeyDown={onKeyDown}
    >
      <path className="connection-hit" d={d} fill="none" stroke="transparent" strokeWidth={14} />
      <path
        className="connection-line"
        d={d}
        fill="none"
        markerEnd="url(#connection-arrow)"
      />
      <text className="connection-icon" x={mx} y={my} textAnchor="middle" dominantBaseline="central">
        {TYPE_ICON[c.type]}
      </text>
      {c.label && (
        <text className="connection-label" x={mx} y={my + 16} textAnchor="middle">
          {c.label}
        </text>
      )}
      {warned && (
        <text
          className="connection-warning"
          x={mx + 16}
          y={my}
          dominantBaseline="central"
          fill={open ? WARNING_COLOR : MUTED_COLOR}
        >
          ▲
        </text>
      )}
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
