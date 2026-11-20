/** Filter controls above the map: main/open toggles, time range, characters, reset and the notes toggle. */
import type { Book } from '@bookly/shared';
import { defaultFilterState, hasActiveFilter, type FilterState } from './filters';

interface Props {
  book: Book;
  state: FilterState;
  onChange: (next: FilterState) => void;
  /** Number of storylines passing the current filter. */
  visibleCount: number;
}

/** Controlled filter form; every change is reported through onChange. */
export function FilterBar({ book, state, onChange, visibleCount }: Props) {
  const set = (patch: Partial<FilterState>) => onChange({ ...state, ...patch });
  const timePoints = [...book.timePoints].sort((a, b) => a.position - b.position);
  const toggleCharacter = (id: string) =>
    set({ characterIds: state.characterIds.includes(id) ? state.characterIds.filter((c) => c !== id) : [...state.characterIds, id] });

  return (
    <form className="filter-bar" aria-label="Filter" onSubmit={(e) => e.preventDefault()}>
      <label>
        <input type="checkbox" checked={state.mainOnly} onChange={(e) => set({ mainOnly: e.target.checked })} /> Nur Hauptstränge
      </label>
      <label>
        <input type="checkbox" checked={state.openOnly} onChange={(e) => set({ openOnly: e.target.checked })} /> Nur bewusst offene
      </label>
      <label>
        Von
        <select value={state.fromId ?? ''} onChange={(e) => set({ fromId: e.target.value || null })}>
          <option value="">–</option>
          {timePoints.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      <label>
        Bis
        <select value={state.toId ?? ''} onChange={(e) => set({ toId: e.target.value || null })}>
          <option value="">–</option>
          {timePoints.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      {book.characters.length > 0 && (
        <fieldset>
          <legend>Figuren</legend>
          {book.characters.map((c) => (
            <label key={c.id}>
              <input type="checkbox" checked={state.characterIds.includes(c.id)} onChange={() => toggleCharacter(c.id)} /> {c.name}
            </label>
          ))}
        </fieldset>
      )}
      <label>
        <input type="checkbox" checked={state.showNotes} onChange={(e) => set({ showNotes: e.target.checked })} /> Notizen einblenden
      </label>
      <button type="button" disabled={!hasActiveFilter(state)} onClick={() => onChange({ ...defaultFilterState(), showNotes: state.showNotes })}>
        Filter zurücksetzen
      </button>
      <span className="filter-count" aria-live="polite">{visibleCount} von {book.storylines.length} Storylines</span>
    </form>
  );
}
