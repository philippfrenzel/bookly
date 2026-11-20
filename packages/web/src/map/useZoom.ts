/** d3-zoom wiring for the storyline map: wheel/pinch zoom, middle-button/Space/header panning and a pure coordinate helper. */
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
/** Largest magnification „Alles einpassen“ applies, so a small plan fills the canvas without turning into a poster. */
export const MAX_FIT_ZOOM = 1.5;
const ZOOM_STEP = 1.4;
/** The automatic first view never shrinks below this, so the map is always legible on load. */
const INITIAL_MIN_ZOOM = 0.3;

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

/**
 * Transform that fits the content into the viewport: scale capped at MAX_FIT_ZOOM and floored at MIN_ZOOM,
 * centred horizontally and top-aligned, so the plan reads from its station header down. Identity when the viewport or content size is unknown.
 */
export function fitTransform(
  viewW: number,
  viewH: number,
  content?: { width: number; height: number },
  minK: number = MIN_ZOOM,
): ZoomTransform {
  if (!content || viewW <= 0 || viewH <= 0 || content.width <= 0 || content.height <= 0) return zoomIdentity;
  const k = Math.max(minK, Math.min(MAX_FIT_ZOOM, viewW / content.width, viewH / content.height));
  return zoomIdentity.translate((viewW - content.width * k) / 2, 0).scale(k);
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
    // Start with everything in view when the content does not fit; small maps stay at 1:1.
    // The size is only trusted once the svg has been laid out (non-zero), so wait for the first real measurement.
    let fitted = false;
    const initialFit = () => {
      if (fitted || svg.clientWidth <= 0 || svg.clientHeight <= 0) return;
      fitted = true;
      const initial = fitTransform(svg.clientWidth, svg.clientHeight, size.current, INITIAL_MIN_ZOOM);
      if (initial.k < 1) select(svg).call(z.transform, initial);
    };
    initialFit();
    let observer: ResizeObserver | undefined;
    let raf = 0;
    if (!fitted) {
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(initialFit);
        observer.observe(svg);
      } else if (typeof requestAnimationFrame !== 'undefined') {
        raf = requestAnimationFrame(initialFit);
      }
    }
    let hovering = false;
    const enter = () => (hovering = true);
    const leave = () => (hovering = false);
    const down = (e: KeyboardEvent) => {
      const target = e.target as Element | null;
      if (e.code !== 'Space' || /input|textarea|select|button/i.test(target?.tagName ?? '')) return;
      space.current = true;
      // Keep the page from scrolling while panning, but let a focused bar still handle Space.
      if (hovering && !target?.closest?.(NO_PAN)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    const blur = () => (space.current = false);
    svg.addEventListener('mouseenter', enter);
    svg.addEventListener('mouseleave', leave);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      svg.removeEventListener('mouseenter', enter);
      svg.removeEventListener('mouseleave', leave);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      select(svg).on('.zoom', null);
      observer?.disconnect();
      if (raf) cancelAnimationFrame(raf);
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
    select(svg).call(behavior.current.transform, fitTransform(svg.clientWidth, svg.clientHeight, size.current));
  }, [svgRef]);

  return { transform, fit, zoomIn: () => scaleBy(ZOOM_STEP), zoomOut: () => scaleBy(1 / ZOOM_STEP), spaceHeld: () => space.current };
}
