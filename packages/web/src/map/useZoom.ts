/** d3-zoom wiring for the storyline map: wheel/pinch zoom, middle-button/Space/header panning and a pure coordinate helper. */
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
const ZOOM_STEP = 1.4;

/** Converts a client (screen) position into content coordinates under the given zoom transform. */
export function toContentPoint(
  transform: ZoomTransform,
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
): { x: number; y: number } {
  const [x, y] = transform.invert([clientX - rect.left, clientY - rect.top]);
  return { x, y };
}

/** SVG transform attribute value for a zoom transform. */
export function transformAttr(t: ZoomTransform): string {
  return `translate(${t.x},${t.y}) scale(${t.k})`;
}

/** Selector of elements whose left-drag must never pan (they own their own gestures). */
const NO_PAN = '.connect-handle, .storyline-bar, .connection-path';
/** Selector of the area where a plain left-drag pans. */
const PAN_AREA = '.pan-area';

/**
 * Wheel/pinch always zoom. Panning needs the middle button, Space held, or a left-drag on the header;
 * left-drag on empty lanes is left to drag-to-create.
 */
export function zoomFilter(event: Event, spaceHeld: boolean): boolean {
  if (event.type === 'wheel') return true;
  const target = event.target as Element | null;
  if (event.type === 'touchstart') return !target?.closest?.(NO_PAN);
  if (target?.closest?.(NO_PAN)) return false;
  const button = (event as MouseEvent).button ?? 0;
  if (button === 1) return true;
  if (button !== 0) return false;
  return spaceHeld || !!target?.closest?.(PAN_AREA);
}

/** Zoom state for the map svg; `contentSize` lets fit() scale everything into the viewport. */
export function useZoom(
  svgRef: RefObject<SVGSVGElement>,
  contentSize?: { width: number; height: number },
): { transform: ZoomTransform; fit: () => void; zoomIn: () => void; zoomOut: () => void; spaceHeld: () => boolean } {
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const behavior = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const space = useRef(false);
  const size = useRef(contentSize);
  size.current = contentSize;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .extent(() => [[0, 0], [svg.clientWidth, svg.clientHeight]])
      .filter((e: Event) => zoomFilter(e, space.current))
      .on('zoom', (e) => setTransform(e.transform));
    behavior.current = z;
    select(svg).call(z).on('dblclick.zoom', null);
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !/input|textarea|select|button/i.test((e.target as Element)?.tagName ?? '')) space.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      select(svg).on('.zoom', null);
    };
  }, [svgRef]);

  const scaleBy = useCallback(
    (factor: number) => {
      const svg = svgRef.current;
      if (svg && behavior.current) select(svg).call(behavior.current.scaleBy, factor);
    },
    [svgRef],
  );

  const fit = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || !behavior.current) return;
    const c = size.current;
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    let t = zoomIdentity;
    if (c && w > 0 && h > 0 && c.width > 0 && c.height > 0) {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(w / c.width, h / c.height)));
      t = zoomIdentity.scale(k);
    }
    select(svg).call(behavior.current.transform, t);
  }, [svgRef]);

  return { transform, fit, zoomIn: () => scaleBy(ZOOM_STEP), zoomOut: () => scaleBy(1 / ZOOM_STEP), spaceHeld: () => space.current };
}
