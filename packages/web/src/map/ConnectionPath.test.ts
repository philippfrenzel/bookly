/** Tests for connection path geometry. */
import { describe, expect, it } from 'vitest';
import { connectionPathD } from './ConnectionPath';

/** Parses "M x y C c1x c1y, c2x c2y, x y" into its numbers. */
function nums(d: string): number[] {
  return d.match(/-?\d+(\.\d+)?/g)!.map(Number);
}

describe('connectionPathD', () => {
  it('keeps forward connections horizontal at both ends', () => {
    const [x1, y1, c1x, c1y, c2x, c2y, x2, y2] = nums(connectionPathD(100, 50, 300, 150));
    expect([c1y, c2y]).toEqual([y1, y2]);
    expect(c1x).toBeGreaterThan(x1!);
    expect(c2x).toBeLessThan(x2!);
  });

  it('bounds backwards connections to the endpoint x-range plus 40px', () => {
    const d = connectionPathD(500, 50, 100, 250);
    for (const x of nums(d).filter((_, i) => i % 2 === 0)) {
      expect(x).toBeGreaterThanOrEqual(100 - 40);
      expect(x).toBeLessThanOrEqual(500 + 40);
    }
  });

  it('does not run flat along the bars for same-lane backwards connections', () => {
    const [, y1, , c1y] = nums(connectionPathD(500, 50, 100, 50));
    expect(c1y).toBeGreaterThan(y1!);
  });
});
