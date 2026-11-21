/** Turns a work's style (presets, team styles, own addition) into the instruction text the AI gets (FR-015..017). */
import { STYLE_PRESETS } from '@bookly/shared';
import type { BookStyle, TeamStyle } from '@bookly/shared';

/** The style instruction, or '' when the work has no style set. */
export function styleText(style: BookStyle, teamStyles: TeamStyle[]): string {
  const parts = [
    ...STYLE_PRESETS.filter((p) => style.presetKeys.includes(p.key)).map((p) => `${p.name}: ${p.description}`),
    ...teamStyles.filter((t) => style.teamStyleIds.includes(t.id)).map((t) => `${t.name}: ${t.description}`),
    ...(style.addition ? [`Ergänzung des Autors: ${style.addition}`] : []),
  ];
  return parts.join('\n');
}
