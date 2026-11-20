/** Drawn SVG glyphs for status markers and connection types, in one stroke weight on a 16-unit grid. */
import type { ConnectionType, StorylineStatus } from '@bookly/shared';

/** Path data per status, drawn centred on (0,0) within roughly ±5 units. */
const STATUS_PATH: Record<StorylineStatus, string> = {
  // pencil: diagonal shaft with a tip
  in_progress: 'M -4 4 L -3 1 L 2.5 -4.5 L 4.5 -2.5 L -1 3 Z',
  // check mark
  completed: 'M -4.5 0.5 L -1.5 3.5 L 4.5 -3.5',
  // open ring
  open: 'M 3.5 0 A 3.5 3.5 0 1 1 -3.5 0 A 3.5 3.5 0 1 1 3.5 0',
};

/** Status glyph centred on the given point, stroked in the given colour. */
export function StatusGlyph({ status, x, y, color }: { status: StorylineStatus; x: number; y: number; color: string }) {
  return (
    <path
      className="status-glyph"
      d={STATUS_PATH[status]}
      transform={`translate(${x} ${y})`}
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** Path data per connection type, centred on (0,0) within roughly ±5 units. */
const TYPE_PATH: Record<ConnectionType, string> = {
  // fast forward: two chevrons pointing right
  time_jump: 'M -5 -4 L -1 0 L -5 4 M 0 -4 L 4 0 L 0 4',
  // rewind: two chevrons pointing left
  flashback: 'M 5 -4 L 1 0 L 5 4 M 0 -4 L -4 0 L 0 4',
  // two lines merging into one
  merge: 'M -5 -4 L 0 0 L -5 4 M 0 0 L 5 0',
  // swap arrows
  character_switch: 'M -5 -2 L 4 -2 M 2 -4.5 L 4.5 -2 L 2 0.5 M 5 2 L -4 2 M -2 -0.5 L -4.5 2 L -2 4.5',
};

/** Connection type glyph in a white interchange pill. */
export function TypeGlyph({ type, x, y }: { type: ConnectionType; x: number; y: number }) {
  return (
    <g className="type-glyph" transform={`translate(${x} ${y})`}>
      <rect x={-11} y={-8} width={22} height={16} rx={8} />
      <path d={TYPE_PATH[type]} fill="none" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** Warning triangle with exclamation mark, centred on the given point. */
export function WarningGlyph({ x, y, open }: { x: number; y: number; open: boolean }) {
  return (
    <g className={`warning-glyph${open ? ' is-open' : ''}`} transform={`translate(${x} ${y})`}>
      <path d="M 0 -7 L 7.5 6 L -7.5 6 Z" strokeLinejoin="round" />
      <path d="M 0 -2 L 0 1.5 M 0 3.6 L 0 3.7" strokeWidth={1.8} strokeLinecap="round" />
    </g>
  );
}
