/** SVG bird's-eye view of all storylines along the book's story timeline. */
import { orderIndex, type Book, type Hint, type Id, type TimeRange } from '@bookly/shared';
import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { assignLanes, columnAt, COLUMN_WIDTH, HEADER_HEIGHT, LANE_HEIGHT } from './layout';
import { StorylineBar } from './StorylineBar';

export interface StorylineMapProps {
  book: Book;
  hints: Hint[];
  selectedId: Id | null;
  onSelectStoryline: (id: Id) => void;
  /** Called when the author drags across free lane area; the range is ordered start <= end. */
  onCreateRange?: (range: TimeRange) => void;
}

const BOTTOM_PADDING = 16;
const MIN_DRAG_PX = 5;

/** Renders the time axis header, grid and one bar per storyline; connections are drawn elsewhere. */
export function StorylineMap({ book, selectedId, onSelectStoryline, onCreateRange }: StorylineMapProps) {
  const sorted = useMemo(() => [...book.timePoints].sort((a, b) => a.position - b.position), [book.timePoints]);
  const idx = useMemo(() => orderIndex(book.timePoints), [book.timePoints]);
  const layout = useMemo(() => assignLanes(book.storylines, idx), [book.storylines, idx]);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x0: number; moved: boolean } | null>(null);
  const [selection, setSelection] = useState<[number, number] | null>(null);

  if (sorted.length === 0) return <p className="map-empty">Lege zuerst Zeitpunkte an.</p>;
  if (book.storylines.length === 0) return <p className="map-empty">Noch keine Storylines. Lege die erste an.</p>;

  const width = sorted.length * COLUMN_WIDTH;
  const height = HEADER_HEIGHT + layout.laneCount * LANE_HEIGHT + BOTTOM_PADDING;
  const [mainFirst, mainLast] = layout.mainLanes;

  const clampColumn = (x: number) => Math.min(sorted.length - 1, Math.max(0, columnAt(x)));
  const localX = (e: PointerEvent) => e.clientX - (svgRef.current?.getBoundingClientRect().left ?? 0);
  const columns = (x0: number, x1: number) => [clampColumn(x0), clampColumn(x1)].sort((a, b) => a - b) as [number, number];

  const onPointerDown = (e: PointerEvent<SVGRectElement>) => {
    if (!onCreateRange || e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x0: localX(e), moved: false };
  };
  const onPointerMove = (e: PointerEvent<SVGRectElement>) => {
    const d = drag.current;
    if (!d) return;
    const x = localX(e);
    if (Math.abs(x - d.x0) >= MIN_DRAG_PX) d.moved = true;
    if (d.moved) setSelection(columns(d.x0, x));
  };
  const onPointerUp = (e: PointerEvent<SVGRectElement>) => {
    const d = drag.current;
    drag.current = null;
    setSelection(null);
    if (!d?.moved || !onCreateRange) return;
    const [a, b] = columns(d.x0, localX(e));
    onCreateRange({ startId: sorted[a]!.id, endId: sorted[b]!.id });
  };

  return (
    <div className="storyline-map">
      <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Storylines auf der Zeitachse">
        {mainLast >= mainFirst && (
          <rect
            className="main-band"
            x={0}
            y={HEADER_HEIGHT + mainFirst * LANE_HEIGHT}
            width={width}
            height={(mainLast - mainFirst + 1) * LANE_HEIGHT}
          />
        )}
        {sorted.map((tp, i) => (
          <g key={tp.id}>
            <line className="grid-line" x1={i * COLUMN_WIDTH} x2={i * COLUMN_WIDTH} y1={0} y2={height} />
            <text className="column-name" x={i * COLUMN_WIDTH + COLUMN_WIDTH / 2} y={HEADER_HEIGHT / 2}>
              {tp.name}
            </text>
          </g>
        ))}
        <line className="grid-line" x1={width} x2={width} y1={0} y2={height} />
        <line className="header-rule" x1={0} x2={width} y1={HEADER_HEIGHT} y2={HEADER_HEIGHT} />
        {onCreateRange && (
          <rect
            className="drag-surface"
            x={0}
            y={HEADER_HEIGHT}
            width={width}
            height={height - HEADER_HEIGHT}
            fill="transparent"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              drag.current = null;
              setSelection(null);
            }}
          />
        )}
        {selection && (
          <rect
            className="drag-selection"
            x={selection[0] * COLUMN_WIDTH}
            y={HEADER_HEIGHT}
            width={(selection[1] - selection[0] + 1) * COLUMN_WIDTH}
            height={height - HEADER_HEIGHT}
            pointerEvents="none"
          />
        )}
        {book.storylines.map((s) => (
          <StorylineBar
            key={s.id}
            storyline={s}
            lane={layout.laneOf.get(s.id) ?? 0}
            idx={idx}
            selected={s.id === selectedId}
            onSelect={onSelectStoryline}
          />
        ))}
      </svg>
    </div>
  );
}
