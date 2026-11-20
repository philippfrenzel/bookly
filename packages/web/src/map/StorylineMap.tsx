/** SVG bird's-eye view of all storylines along the book's story timeline. */
import { bounds, orderIndex, type Book, type Hint, type Id, type TimeRange } from '@bookly/shared';
import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { assignLanes, barGeometry, columnAt, COLUMN_WIDTH, HEADER_HEIGHT, laneHeightFor } from './layout';
import { ConnectionPath, ConnectionStub } from './ConnectionPath';
import { applyFilters, type MapFilter } from './filters';
import { StorylineBar } from './StorylineBar';
import { toContentPoint, transformAttr, useZoom } from './useZoom';

export interface StorylineMapProps {
  book: Book;
  hints: Hint[];
  selectedId: Id | null;
  onSelectStoryline: (id: Id) => void;
  /** Called when the author drags across free lane area; the range is ordered start <= end. */
  onCreateRange?: (range: TimeRange) => void;
  /** Called when a connection handle is dragged from one bar onto another. */
  onConnect?: (fromId: Id, toId: Id) => void;
  /** Called when an existing connection is clicked. */
  onSelectConnection?: (id: Id) => void;
  /** Visibility filter; storylines that fail it are not drawn. Omitted means show all. */
  filter?: MapFilter;
  /** Show storyline notes under the bars. */
  showNotes?: boolean;
}

const BOTTOM_PADDING = 16;
const MIN_DRAG_PX = 5;
const MAX_VIEWPORT_HEIGHT = 640;
const HANDLE_INSET = 6;

/** Renders the time axis header, grid and connections under the bars, one bar per storyline and the connection handles. */
export function StorylineMap(props: StorylineMapProps) {
  const { book, filter } = props;
  const visibleIds = useMemo(() => (filter ? applyFilters(book, filter) : null), [book, filter]);
  if (book.timePoints.length === 0) return <p className="map-empty">Lege zuerst Zeitpunkte an.</p>;
  if (book.storylines.length === 0) return <p className="map-empty">Noch keine Storylines. Lege die erste an.</p>;
  if (visibleIds && visibleIds.size === 0) return <p className="map-empty">Keine Storyline entspricht dem Filter.</p>;
  return <MapCanvas {...props} visibleIds={visibleIds} />;
}

/** The zoomable svg; mounted only when there is something to draw so zoom attaches to a real element. */
function MapCanvas({ book, hints, selectedId, onSelectStoryline, onCreateRange, onConnect, onSelectConnection, showNotes = false, visibleIds }: StorylineMapProps & { visibleIds: Set<Id> | null }) {
  const sorted = useMemo(() => [...book.timePoints].sort((a, b) => a.position - b.position), [book.timePoints]);
  const idx = useMemo(() => orderIndex(book.timePoints), [book.timePoints]);
  const visible = useMemo(() => (visibleIds ? book.storylines.filter((s) => visibleIds.has(s.id)) : book.storylines), [book.storylines, visibleIds]);
  const layout = useMemo(() => assignLanes(visible, idx), [visible, idx]);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x0: number; moved: boolean } | null>(null);
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const link = useRef<{ fromId: Id } | null>(null);

  const width = sorted.length * COLUMN_WIDTH;
  const laneHeight = laneHeightFor(showNotes);
  const height = HEADER_HEIGHT + layout.laneCount * laneHeight + BOTTOM_PADDING;
  const { transform, fit, zoomIn, zoomOut, spaceHeld } = useZoom(svgRef, { width, height });
  const [mainFirst, mainLast] = layout.mainLanes;

  const clampColumn = (x: number) => Math.min(sorted.length - 1, Math.max(0, columnAt(x)));
  /** Pointer position in content coordinates, i.e. with the current zoom transform undone. */
  const localPoint = (e: PointerEvent) =>
    toContentPoint(transform, e.clientX, e.clientY, svgRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 });
  const localX = (e: PointerEvent) => localPoint(e).x;
  const columns = (x0: number, x1: number) => [clampColumn(x0), clampColumn(x1)].sort((a, b) => a - b) as [number, number];

  const onPointerDown = (e: PointerEvent<SVGRectElement>) => {
    if (!onCreateRange || e.button !== 0 || spaceHeld()) return;
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

  /** Storyline whose bar lies under the given svg-local point, if any. */
  const barAt = (x: number, y: number) => {
    const lane = Math.floor((y - HEADER_HEIGHT) / laneHeight);
    const col = columnAt(x);
    return visible.find((s) => {
      if (layout.laneOf.get(s.id) !== lane) return false;
      const [a, b] = bounds(s.range, idx);
      return col >= a && col <= b;
    });
  };
  const onLinkUp = (e: PointerEvent) => {
    const from = link.current;
    link.current = null;
    if (!from || !onConnect) return;
    const { x, y } = localPoint(e);
    const target = barAt(x, y);
    if (target && target.id !== from.fromId) onConnect(from.fromId, target.id);
  };

  return (
    <div className="storyline-map">
      <div className="zoom-controls">
        <button type="button" aria-label="Vergrößern" onClick={zoomIn}>+</button>
        <button type="button" aria-label="Verkleinern" onClick={zoomOut}>−</button>
        <button type="button" aria-label="Alles einpassen" onClick={fit}>Alles einpassen</button>
        <span className="zoom-hint">Zoomen: Mausrad · Verschieben: Leertaste + Ziehen oder Kopfzeile ziehen</span>
      </div>
      <svg ref={svgRef} width="100%" height={Math.min(Math.max(height, 240), MAX_VIEWPORT_HEIGHT)} role="group" aria-label="Storylines auf der Zeitachse">
        <defs>
          <marker id="connection-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="connection-arrowhead" />
          </marker>
        </defs>
        <g className="zoom-layer" transform={transformAttr(transform)}>
        {mainLast >= mainFirst && (
          <rect
            className="main-band"
            x={0}
            y={HEADER_HEIGHT + mainFirst * laneHeight}
            width={width}
            height={(mainLast - mainFirst + 1) * laneHeight}
          />
        )}
        {sorted.map((tp, i) => (
          <line key={tp.id} className="grid-line" x1={i * COLUMN_WIDTH} x2={i * COLUMN_WIDTH} y1={0} y2={height} />
        ))}
        {/* Left-drag on the header pans the map (see zoomFilter). */}
        <g className="pan-area">
          <rect x={0} y={0} width={width} height={HEADER_HEIGHT} fill="transparent" />
          {sorted.map((tp, i) => (
            <text key={tp.id} className="column-name" x={i * COLUMN_WIDTH + COLUMN_WIDTH / 2} y={HEADER_HEIGHT / 2}>
              {tp.name}
            </text>
          ))}
        </g>
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
        {/* Connections sit under the bars so a bar always wins the click. */}
        {book.connections.map((c) => {
          const from = book.storylines.find((s) => s.id === c.fromId);
          const to = book.storylines.find((s) => s.id === c.toId);
          if (!from || !to) return null;
          const fromShown = !visibleIds || visibleIds.has(from.id);
          const toShown = !visibleIds || visibleIds.has(to.id);
          if (!fromShown && !toShown) return null;
          if (fromShown !== toShown) {
            const shown = fromShown ? from : to;
            return <ConnectionStub key={c.id} visible={shown} lane={layout.laneOf.get(shown.id) ?? 0} idx={idx} laneHeight={laneHeight} visibleIs={fromShown ? 'from' : 'to'} />;
          }
          return (
            <ConnectionPath
              key={c.id}
              connection={c}
              from={from}
              to={to}
              fromLane={layout.laneOf.get(from.id) ?? 0}
              toLane={layout.laneOf.get(to.id) ?? 0}
              idx={idx}
              laneHeight={laneHeight}
              hints={hints.filter((h) => h.connectionId === c.id)}
              onSelect={(id) => onSelectConnection?.(id)}
            />
          );
        })}
        {visible.map((s) => (
          <StorylineBar
            key={s.id}
            storyline={s}
            lane={layout.laneOf.get(s.id) ?? 0}
            idx={idx}
            selected={s.id === selectedId}
            showNote={showNotes}
            laneHeight={laneHeight}
            onSelect={onSelectStoryline}
          />
        ))}
        {onConnect &&
          visible.map((s) => {
            const g = barGeometry(s, layout.laneOf.get(s.id) ?? 0, idx, laneHeight);
            return (
              <circle
                key={s.id}
                className="connect-handle"
                cx={g.x + g.width - HANDLE_INSET}
                cy={g.y}
                r={6}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  link.current = { fromId: s.id };
                }}
                onPointerUp={onLinkUp}
                onPointerCancel={() => {
                  link.current = null;
                }}
              >
                <title>{`Verbindung von „${s.title}“ ziehen`}</title>
              </circle>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
