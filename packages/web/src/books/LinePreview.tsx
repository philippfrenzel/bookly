/** Miniature storyline map for a book card: each storyline as a coloured line over the time axis. */
import type { CSSProperties } from 'react';
import type { BookLinePreview } from '@bookly/shared';

const W = 220;
const H = 90;
const PAD_X = 12;
const PAD_Y = 16;

interface Props {
  lines: BookLinePreview[];
  /** Height in CSS px; the drawing keeps its aspect ratio. */
  height?: number;
}

/** Decorative preview; an empty book shows a dotted line waiting to be drawn. */
export function LinePreview({ lines, height = H }: Props) {
  const rowY = (i: number) =>
    lines.length === 1 ? H / 2 : PAD_Y + (i * (H - 2 * PAD_Y)) / Math.max(lines.length - 1, 1);
  const x = (f: number) => PAD_X + f * (W - 2 * PAD_X);
  return (
    <svg className="line-preview" viewBox={`0 0 ${W} ${H}`} width="100%" height={height} aria-hidden="true" focusable="false">
      {lines.length === 0 ? (
        <path d={`M${PAD_X} ${H / 2}H${W - PAD_X}`} className="line-preview-empty" />
      ) : (
        lines.map((l, i) => {
          const y = rowY(i);
          const x1 = x(l.start);
          const x2 = Math.max(x(l.end), x1 + 8);
          const width = l.kind === 'main' ? 8 : 5;
          return (
            <g key={i}>
              <path d={`M${x1} ${y}H${x2}`} stroke={l.color} strokeWidth={width} strokeLinecap="round" />
              <circle cx={x1} cy={y} r={width / 2 + 1} fill="#fff" stroke={l.color} strokeWidth={2} />
              <circle cx={x2} cy={y} r={width / 2 + 1} fill="#fff" stroke={l.color} strokeWidth={2} />
            </g>
          );
        })
      )}
    </svg>
  );
}

/** CSS custom property that tints a card's preview area after the book's first line colour. */
export function tintStyle(lines: BookLinePreview[]): CSSProperties {
  return { ['--tint' as string]: lines[0]?.color ?? '#8a8178' };
}
