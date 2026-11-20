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
  onSelect: (id: string) => void;
}

/** Focusable path with arrowhead, type icon, label and a warning triangle when hints exist. */
export function ConnectionPath({ connection: c, from, to, fromLane, toLane, idx, hints, onSelect }: Props) {
  const a = barGeometry(from, fromLane, idx);
  const b = barGeometry(to, toLane, idx);
  const x1 = a.x + a.width - INSET;
  const y1 = a.y;
  const x2 = b.x + INSET;
  const y2 = b.y;
  const pull = Math.max(40, Math.abs(x2 - x1) / 2);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
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
      role="button"
      tabIndex={0}
      aria-label={`Verbindung „${from.title}“ → „${to.title}“`}
      onClick={() => onSelect(c.id)}
      onKeyDown={onKeyDown}
    >
      <path className="connection-hit" d={`M ${x1} ${y1} C ${x1 + pull} ${y1}, ${x2 - pull} ${y2}, ${x2} ${y2}`} fill="none" stroke="transparent" strokeWidth={14} />
      <path
        className="connection-line"
        d={`M ${x1} ${y1} C ${x1 + pull} ${y1}, ${x2 - pull} ${y2}, ${x2} ${y2}`}
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
