/** Shows an AI suggestion per field with „Übernehmen“ and „Verwerfen“. */
import type { Suggestion } from '@bookly/shared';

type Field = 'behavior' | 'intentions';

const LABELS: Record<Field, string> = { behavior: 'Verhalten', intentions: 'Absichten' };

interface Props {
  suggestion: Suggestion;
  /** Current (live) field values, or getters for them; a non-empty one is only replaced after confirmation. */
  fields: Record<Field, string | (() => string)>;
  onApply: (field: Field, value: string) => void;
  onDismiss: () => void;
}

/** Suggestion panel; applying over existing text asks first. */
export function SuggestionBox({ suggestion, fields, onApply, onDismiss }: Props) {
  const apply = (field: Field) => {
    const current = typeof fields[field] === 'function' ? (fields[field] as () => string)() : (fields[field] as string);
    if (current.trim() !== '' && !window.confirm('Vorhandenen Text ersetzen?')) return;
    onApply(field, suggestion[field]);
  };
  return (
    <div className="suggestion-box" aria-label="KI-Vorschlag" role="group">
      {(['behavior', 'intentions'] as const).map((field) => (
        <div key={field} className="suggestion-field">
          <strong>{LABELS[field]}</strong>
          <p>{suggestion[field]}</p>
          <button type="button" onClick={() => apply(field)}>Übernehmen</button>
        </div>
      ))}
      <button type="button" onClick={onDismiss}>Verwerfen</button>
    </div>
  );
}
