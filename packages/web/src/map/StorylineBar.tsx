/**
 * One storyline drawn as a line on the network plan: its line colour and weight (main lines thick,
 * side lines thin), an origin station carrying the status glyph, station dots per time point, the
 * signet and title above, and (for main lines) section segments with their names below.
 */
import { bounds, STATUS_STYLE, type OrderIndex, type Storyline } from '@bookly/shared';
import type { KeyboardEvent } from 'react';
import { StatusGlyph } from './icons';
import { barGeometry, COLUMN_WIDTH, LANE_HEIGHT } from './layout';
import { inkOn } from './signets';

const INSET = 6;
const SEGMENT_GAP = 3;
const MIN_TITLE_WIDTH = 80;
const MAIN_STROKE = 14;
const SIDE_STROKE = 6;
const STATION_R = 8;
const SIGNET_W = 26;
const SIGNET_H = 16;

interface Props {
  storyline: Storyline;
  lane: number;
  idx: OrderIndex;
  selected: boolean;
  /** Line signet such as „H1“ or „N2“; omitted draws no badge. */
  signet?: string;
  /** Another line is highlighted, so this one recedes. */
  dimmed?: boolean;
  /** Show the storyline note under the bar. */
  showNote?: boolean;
  /** Lane pitch in px (see laneHeightFor). */
  laneHeight?: number;
  onSelect: (id: string) => void;
  /** Pointer entered (id) or left (null) the line, for the highlight. */
  onHover?: (id: string | null) => void;
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

/** Renders a focusable, clickable line for a storyline. */
export function StorylineBar({ storyline: s, lane, idx, selected, signet, dimmed = false, showNote = false, laneHeight, onSelect, onHover }: Props) {
  const { x, y, width } = barGeometry(s, lane, idx, laneHeight);
  const isMain = s.kind === 'main';
  const stroke = isMain ? MAIN_STROKE : SIDE_STROKE;
  const left = x + INSET;
  const barWidth = width - 2 * INSET;
  const status = STATUS_STYLE[s.status];
  const segments = isMain ? [...s.sections].sort((a, b) => a.order - b.order) : [];
  const [startCol, endCol] = bounds(s.range, idx);
  const stationX = left + STATION_R + 1;
  const titleY = y - stroke / 2 - 9;
  const titleX = signet ? left + SIGNET_W + 6 : left;

  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(s.id);
    }
  };

  const classes = ['storyline-bar', isMain ? 'is-main' : 'is-side'];
  if (selected) classes.push('is-selected');
  if (dimmed) classes.push('is-dimmed');

  return (
    <g
      className={classes.join(' ')}
      role="button"
      tabIndex={0}
      aria-label={`Storyline „${s.title}“`}
      aria-pressed={selected}
      onClick={() => onSelect(s.id)}
      onKeyDown={onKeyDown}
      onPointerEnter={() => onHover?.(s.id)}
      onPointerLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(s.id)}
      onBlur={() => onHover?.(null)}
    >
      <title>{`${signet ? `${signet} · ` : ''}${s.title} · ${status.label}`}</title>
      <rect className="bar-hit" x={x} y={y - LANE_HEIGHT / 2} width={width} height={LANE_HEIGHT} fill="transparent" />
      <rect
        className="bar-outline"
        x={left - 5}
        y={y - stroke / 2 - 5}
        width={barWidth + 10}
        height={stroke + 10}
        rx={(stroke + 10) / 2}
      />
      <rect
        className="line-body"
        x={left}
        y={y - stroke / 2}
        width={barWidth}
        height={stroke}
        rx={stroke / 2}
        fill={s.color}
        opacity={segments.length > 0 ? 0.35 : 1}
      />
      {segments.map((sec) => {
        const [a, b] = bounds(sec.range, idx);
        const sx = Math.max(a * COLUMN_WIDTH + SEGMENT_GAP / 2, left);
        const ex = Math.min((b + 1) * COLUMN_WIDTH - SEGMENT_GAP / 2, left + barWidth);
        const w = Math.max(0, ex - sx);
        return (
          <g key={sec.id}>
            <rect x={sx} y={y - stroke / 2} width={w} height={stroke} rx={stroke / 2} fill={s.color} />
            {w >= MIN_TITLE_WIDTH && (
              <text className="section-title" x={sx + 2} y={y + stroke / 2 + 14}>
                {fit(sec.title, w - 4)}
              </text>
            )}
          </g>
        );
      })}
      {isMain &&
        Array.from({ length: endCol - startCol + 1 }, (_, i) => {
          const cx = (startCol + i) * COLUMN_WIDTH + COLUMN_WIDTH / 2;
          if (cx - stationX < STATION_R + 6) return null;
          return <circle key={i} className="station-dot" cx={cx} cy={y} r={2.5} />;
        })}
      {signet && (
        <g className="signet" aria-hidden="true">
          <rect x={left} y={titleY - SIGNET_H + 4} width={SIGNET_W} height={SIGNET_H} rx={3} fill={s.color} />
          <text x={left + SIGNET_W / 2} y={titleY - SIGNET_H / 2 + 4} fill={inkOn(s.color)}>
            {signet}
          </text>
        </g>
      )}
      <text className="bar-title" x={titleX} y={titleY}>
        {fit(s.title, barWidth - (titleX - left))}
      </text>
      {showNote && s.note && (
        <text className="bar-note" x={left} y={y + stroke / 2 + 28}>
          <title>{s.note}</title>
          {clampTwoLines(s.note, barWidth).map((line, i) => (
            <tspan key={i} x={left} dy={i === 0 ? 0 : 12}>
              {line}
            </tspan>
          ))}
        </text>
      )}
      {/* Origin station: the status glyph sits on the line start, inside the lane. */}
      <g className="status-station" role="img" aria-label={`Status: ${status.label}`}>
        <circle cx={stationX} cy={y} r={STATION_R + 1} stroke={status.color} />
        <StatusGlyph status={s.status} x={stationX} y={y} color={status.color} />
      </g>
    </g>
  );
}
