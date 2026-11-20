/** Tests for the pure screen-to-content conversion used by drag-to-create and handle drops. */
import { zoomIdentity } from 'd3-zoom';
import { describe, expect, it } from 'vitest';
import { toContentPoint } from './useZoom';

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
