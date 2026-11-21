/**
 * Length choice for AI drafts: „knapp“, „passend zum Buch“ or „ausführlich“. Shared by the block editor
 * and the scene block writer so both offer the same wording.
 */
import { LENGTH_LABELS } from '@bookly/shared';
import type { LengthChoice } from '@bookly/shared';

const ORDER: LengthChoice[] = ['short', 'book', 'long'];

/** A select with the three length choices; `label` is its accessible name. */
export function LengthSelect({ value, onChange, label = 'Länge' }: { value: LengthChoice; onChange: (v: LengthChoice) => void; label?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as LengthChoice)}>
      {ORDER.map((k) => <option key={k} value={k}>{LENGTH_LABELS[k]}</option>)}
    </select>
  );
}
