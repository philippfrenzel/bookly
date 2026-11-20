/** Line signets: short, stable labels per storyline (H1, H2 … for main lines, N1, N2 … for side lines). */
import { bounds, type Id, type OrderIndex, type Storyline } from '@bookly/shared';

/** Numbers each kind in story order (start, then end, then title) and returns the signet per storyline id. */
export function lineSignets(storylines: Storyline[], idx: OrderIndex): Map<Id, string> {
  const out = new Map<Id, string>();
  for (const [kind, prefix] of [['main', 'H'], ['side', 'N']] as const) {
    const list = storylines
      .filter((s) => s.kind === kind)
      .map((s) => ({ s, b: bounds(s.range, idx) }))
      .sort((a, b) => a.b[0] - b.b[0] || a.b[1] - b.b[1] || a.s.title.localeCompare(b.s.title) || (a.s.id < b.s.id ? -1 : 1));
    list.forEach(({ s }, i) => out.set(s.id, `${prefix}${i + 1}`));
  }
  return out;
}

/** Black or white, whichever reads better on the given hex background (WCAG relative luminance). */
export function inkOn(hex: string): '#1A1A1A' | '#FFFFFF' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // Contrast against white vs. against near-black (#1A1A1A, L ≈ 0.0103).
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.0603) ? '#FFFFFF' : '#1A1A1A';
}
