/** Small drawn UI icons (16px, 1.75 stroke) for icon buttons; decorative, the button carries the label. */

const PATHS = {
  up: 'M8 12.5V3.5M4 7.5l4-4 4 4',
  down: 'M8 3.5v9M4 8.5l4 4 4-4',
  plus: 'M8 3.5v9M3.5 8h9',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5M7 7v4M9 7v4',
  minus: 'M3.5 8h9',
  fit: 'M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3',
} as const;

export type IconName = keyof typeof PATHS;

/** Renders one icon in the current text colour. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
