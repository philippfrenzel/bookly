/** Tests for the octilinear connection route and its path data. */
import { describe, expect, it } from 'vitest';
import { connectionMarkerPoint, connectionPathD, connectionRoute, type Point } from './ConnectionPath';

/** Whether every segment is horizontal, vertical or at 45 degrees. */
function octilinear(pts: Point[]): boolean {
  return pts.slice(1).every((b, i) => {
    const a = pts[i]!;
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    return dx < 1e-9 || dy < 1e-9 || Math.abs(dx - dy) < 1e-9;
  });
}

describe('connectionRoute', () => {
  it('leaves and enters forward connections horizontally with octilinear segments', () => {
    for (const pts of [connectionRoute(100, 50, 300, 150), connectionRoute(100, 50, 140, 250)]) {
      expect(pts[1]!.y).toBe(pts[0]!.y);
      expect(pts.at(-2)!.y).toBe(pts.at(-1)!.y);
      expect(octilinear(pts)).toBe(true);
    }
  });

  it('keeps backwards connections within the x-range of their endpoints, never past the timeline ends', () => {
    for (const p of connectionRoute(500, 50, 100, 250)) {
      expect(p.x).toBeGreaterThanOrEqual(100);
      expect(p.x).toBeLessThanOrEqual(500);
    }
    expect(octilinear(connectionRoute(500, 50, 100, 250))).toBe(true);
  });

  it('does not run flat along the bars for same-lane backwards connections', () => {
    const pts = connectionRoute(500, 50, 100, 50);
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThan(50);
  });
});

describe('connectionPathD', () => {
  it('starts and ends at the endpoints', () => {
    const d = connectionPathD(100, 50, 300, 150);
    expect(d.startsWith('M 100 50')).toBe(true);
    expect(d.endsWith('L 300 150')).toBe(true);
  });
});

describe('connectionMarkerPoint', () => {
  it('sits off the lane for same-lane backwards connections', () => {
    expect(connectionMarkerPoint(500, 50, 100, 50).y).toBeGreaterThan(50);
  });

  it('keeps a long backwards run\'s markers near the source end, clear of verticals at the far end', () => {
    expect(connectionMarkerPoint(843, 344, 25, 268)).toEqual({ x: 703, y: 314 });
    expect(connectionMarkerPoint(300, 344, 100, 268)).toEqual({ x: 200, y: 314 });
  });

  it('puts the markers of a lane-crossing drop in the gap before the target lane, not on the lane between', () => {
    // Lanes 76px apart: 268, 344, 420. A drop from 268 to 420 must not carry its markers at 344.
    expect(connectionMarkerPoint(340, 268, 345, 420).y).toBe(382);
  });
});

describe('backwards connections between lanes', () => {
  it('run back inside the gap next to the source lane, not on a lane in between', () => {
    const run = connectionRoute(980, 420, 510, 268)[2]!;
    expect(run.y).toBe(390);
  });
});
