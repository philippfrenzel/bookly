/** One storyline bar: coloured stroke, status marker, title and (for mains) section segments. */
import { bounds, STATUS_STYLE, type OrderIndex, type Storyline } from '@bookly/shared';
import type { KeyboardEvent } from 'react';
import { barGeometry, COLUMN_WIDTH } from './layout';

const INSET = 6;
const SEGMENT_GAP = 2;
const MIN_TITLE_WIDTH = 80;
const MAIN_STROKE = 14;
const SIDE_STROKE = 6;

interface Props {
  storyline: Storyline;
  lane: number;
  idx: OrderIndex;
  selected: boolean;
  /** Show the storyline note under the bar. */
  showNote?: boolean;
  /** Lane pitch in px (see laneHeightFor). */
  laneHeight?: number;
  onSelect: (id: string) => void;
}

/** Shortens text to roughly fit the given pixel width. */
function fit(text: string, width: number): string {
  const max = Math.max(0, Math.floor(width / 6.5));
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

/** Wraps text into at most two lines of roughly the given pixel width, ellipsising the overflow. */
export function clampTwoLines(text: string, width: number): string[] {
  const max = Math.max(4, Math.floor(width / 5.5));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= max || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= 2) return lines.map((l) => fit(l, width));
  return [lines[0]!, fit(`${lines[1]} ${lines.slice(2).join(' ')}`, width)];
}

/** Renders a focusable, clickable bar for a storyline. */
export function StorylineBar({ storyline: s, lane, idx, selected, showNote = false, laneHeight, onSelect }: Props) {
  const { x, y, width } = barGeometry(s, lane, idx, laneHeight);
  const isMain = s.kind === 'main';
  const stroke = isMain ? MAIN_STROKE : SIDE_STROKE;
  const left = x + INSET;
  const barWidth = width - 2 * INSET;
  const status = STATUS_STYLE[s.status];
  const segments = isMain ? [...s.sections].sort((a, b) => a.order - b.order) : [];

  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(s.id);
    }
  };

  return (
    <g
      className={`storyline-bar${selected ? ' is-selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Storyline „${s.title}“`}
      aria-pressed={selected}
      onClick={() => onSelect(s.id)}
      onKeyDown={onKeyDown}
    >
      <title>{`${s.title} · ${status.label}`}</title>
      <rect className="bar-hit" x={x} y={y - 20} width={width} height={40} fill="transparent" />
      <rect
        className="bar-outline"
        x={left - 4}
        y={y - stroke / 2 - 4}
        width={barWidth + 8}
        height={stroke + 8}
        rx={(stroke + 8) / 2}
      />
      <rect
        x={left}
        y={y - stroke / 2}
        width={barWidth}
        height={stroke}
        rx={stroke / 2}
        fill={s.color}
        opacity={segments.length > 0 ? 0.3 : 1}
      />
      {segments.map((sec) => {
        const [a, b] = bounds(sec.range, idx);
        const sx = Math.max(a * COLUMN_WIDTH + SEGMENT_GAP / 2, left);
        const ex = Math.min((b + 1) * COLUMN_WIDTH - SEGMENT_GAP / 2, left + barWidth);
        const w = Math.max(0, ex - sx);
        return (
          <g key={sec.id}>
            <rect x={sx} y={y - stroke / 2} width={w} height={stroke} rx={3} fill={s.color} />
            {w >= MIN_TITLE_WIDTH && (
              <text className="section-title" x={sx + 2} y={y + stroke / 2 + 14}>
                {fit(sec.title, w - 4)}
              </text>
            )}
          </g>
        );
      })}
      <text className="bar-title" x={left + 22} y={y - stroke / 2 - 8}>
        {fit(s.title, barWidth - 22)}
      </text>
      {showNote && s.note && (
        <text className="bar-note" x={left} y={y + stroke / 2 + 26}>
          <title>{s.note}</title>
          {clampTwoLines(s.note, barWidth).map((line, i) => (
            <tspan key={i} x={left} dy={i === 0 ? 0 : 11}>
              {line}
            </tspan>
          ))}
        </text>
      )}
      {/* The marker sits on the bar start, inside the lane, so it never reaches into neighbouring lanes. */}
      <circle className="status-ring" cx={left + 10} cy={y} r={9} stroke={status.color} />
      <text className="status-symbol" x={left + 10} y={y} fill={status.color}>
        {status.symbol}
      </text>
    </g>
  );
}
