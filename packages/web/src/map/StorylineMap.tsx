/** SVG bird's-eye view of all storylines along the book's story timeline. */
import { orderIndex, type Book, type Hint, type Id, type TimeRange } from '@bookly/shared';
import { useMemo } from 'react';
import { assignLanes, COLUMN_WIDTH, HEADER_HEIGHT, LANE_HEIGHT } from './layout';
import { StorylineBar } from './StorylineBar';

export interface StorylineMapProps {
  book: Book;
  hints: Hint[];
  selectedId: Id | null;
  onSelectStoryline: (id: Id) => void;
  /** Reserved for drag-to-create (wired up in a later task). */
  onCreateRange?: (range: TimeRange) => void;
}

const BOTTOM_PADDING = 16;

/** Renders the time axis header, grid and one bar per storyline; connections are drawn elsewhere. */
export function StorylineMap({ book, selectedId, onSelectStoryline }: StorylineMapProps) {
  const sorted = useMemo(() => [...book.timePoints].sort((a, b) => a.position - b.position), [book.timePoints]);
  const idx = useMemo(() => orderIndex(book.timePoints), [book.timePoints]);
  const layout = useMemo(() => assignLanes(book.storylines, idx), [book.storylines, idx]);

  if (sorted.length === 0) return <p className="map-empty">Lege zuerst Zeitpunkte an.</p>;
  if (book.storylines.length === 0) return <p className="map-empty">Noch keine Storylines. Lege die erste an.</p>;

  const width = sorted.length * COLUMN_WIDTH;
  const height = HEADER_HEIGHT + layout.laneCount * LANE_HEIGHT + BOTTOM_PADDING;
  const [mainFirst, mainLast] = layout.mainLanes;

  return (
    <div className="storyline-map">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Storylines auf der Zeitachse">
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
