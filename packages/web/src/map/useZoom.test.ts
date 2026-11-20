/** Tests for the pure zoom helpers: coordinate conversion, fit transform and the gesture filter. */
import { zoomIdentity } from 'd3-zoom';
import { describe, expect, it } from 'vitest';
import { fitTransform, MAX_FIT_ZOOM, toContentPoint, zoomFilter } from './useZoom';

const rect = { left: 100, top: 50 };

describe('toContentPoint', () => {
  it('subtracts the svg origin at identity', () => {
    expect(toContentPoint(zoomIdentity, 130, 90, rect)).toEqual({ x: 30, y: 40 });
  });
  it('undoes scale', () => {
    expect(toContentPoint(zoomIdentity.scale(2), 140, 90, rect)).toEqual({ x: 20, y: 20 });
  });
  it('undoes translation and scale together', () => {
    const t = zoomIdentity.translate(40, -10).scale(0.5);
    expect(toContentPoint(t, 200, 150, rect)).toEqual({ x: 120, y: 220 });
  });
});

describe('fitTransform', () => {
  it('is identity without a known viewport', () => {
    expect(fitTransform(0, 0, { width: 800, height: 400 })).toBe(zoomIdentity);
  });
  it('magnifies small content at most to MAX_FIT_ZOOM, centres it horizontally and aligns it to the top', () => {
    const t = fitTransform(1000, 600, { width: 400, height: 200 });
    expect([t.k, t.x, t.y]).toEqual([MAX_FIT_ZOOM, 200, 0]);
  });
  it('shrinks by the tighter axis', () => {
    const t = fitTransform(1000, 300, { width: 2000, height: 600 });
    expect([t.k, t.x, t.y]).toEqual([0.5, 0, 0]);
  });
  it('is identity when the measured width or height is still zero', () => {
    expect(fitTransform(0, 600, { width: 800, height: 400 })).toBe(zoomIdentity);
    expect(fitTransform(1000, 0, { width: 800, height: 400 })).toBe(zoomIdentity);
  });
  it('respects a custom lower bound for the initial view', () => {
    expect(fitTransform(100, 100, { width: 1e6, height: 1e6 }, 0.3).k).toBe(0.3);
  });
  it('floors at the minimum zoom', () => {
    expect(fitTransform(100, 100, { width: 1e6, height: 1e6 }).k).toBe(0.1);
  });
});

/** Builds an event whose target is the given element without dispatching it. */
function eventOn(type: string, target: Element, init: MouseEventInit = {}): Event {
  const e = type === 'wheel' ? new WheelEvent(type, init) : type === 'touchstart' ? new Event(type) : new MouseEvent(type, init);
  Object.defineProperty(e, 'target', { value: target });
  return e;
}
const el = (cls: string, parent?: Element) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  if (cls) e.setAttribute('class', cls);
  parent?.appendChild(e);
  return e;
};

describe('zoomFilter', () => {
  it('always lets the wheel zoom, even over bars', () => {
    expect(zoomFilter(eventOn('wheel', el('storyline-bar')), false)).toBe(true);
  });
  it('does not pan on a plain left-drag over empty lanes', () => {
    expect(zoomFilter(eventOn('mousedown', el('drag-surface'), { button: 0 }), false)).toBe(false);
  });
  it('pans with the middle button, Space or the header', () => {
    expect(zoomFilter(eventOn('mousedown', el('drag-surface'), { button: 1 }), false)).toBe(true);
    expect(zoomFilter(eventOn('mousedown', el('drag-surface'), { button: 0 }), true)).toBe(true);
    const header = el('pan-area');
    expect(zoomFilter(eventOn('mousedown', el('', header), { button: 0 }), false)).toBe(true);
  });
  it('never pans from handles, bars or connections', () => {
    for (const cls of ['connect-handle', 'storyline-bar', 'connection-path']) {
      const t = el('', el(cls));
      expect(zoomFilter(eventOn('mousedown', t, { button: 1 }), true)).toBe(false);
      expect(zoomFilter(eventOn('touchstart', t), false)).toBe(false);
    }
  });
  it('ignores the right button', () => {
    expect(zoomFilter(eventOn('mousedown', el('pan-area'), { button: 2 }), true)).toBe(false);
  });
});
