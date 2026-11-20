/**
 * Filter controls in one compact row: main/open/notes toggles as chips, time range and characters
 * in small disclosure popovers, a reset that appears only when something is filtered, and the count.
 */
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
  const nameOf = (id: string | null) => timePoints.find((t) => t.id === id)?.name;
  const rangeSummary = state.fromId || state.toId ? `${nameOf(state.fromId) ?? 'Anfang'} – ${nameOf(state.toId) ?? 'Ende'}` : null;
  const active = hasActiveFilter(state);

  return (
    <form className="filter-bar" aria-label="Filter" onSubmit={(e) => e.preventDefault()}>
      <label className="toggle-chip">
        <input type="checkbox" checked={state.mainOnly} onChange={(e) => set({ mainOnly: e.target.checked })} /> Nur Hauptstränge
      </label>
      <label className="toggle-chip">
        <input type="checkbox" checked={state.openOnly} onChange={(e) => set({ openOnly: e.target.checked })} /> Nur bewusst offene
      </label>
      <details className={`filter-pop${rangeSummary ? ' is-active' : ''}`}>
        <summary>{rangeSummary ? `Zeitraum: ${rangeSummary}` : 'Zeitraum'}</summary>
        <div className="pop">
          <label>
            Von
            <select value={state.fromId ?? ''} onChange={(e) => set({ fromId: e.target.value || null })}>
              <option value="">Anfang</option>
              {timePoints.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label>
            Bis
            <select value={state.toId ?? ''} onChange={(e) => set({ toId: e.target.value || null })}>
              <option value="">Ende</option>
              {timePoints.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        </div>
      </details>
      {book.characters.length > 0 && (
        <details className={`filter-pop${state.characterIds.length > 0 ? ' is-active' : ''}`}>
          <summary>{state.characterIds.length > 0 ? `Figuren (${state.characterIds.length})` : 'Figuren'}</summary>
          <fieldset className="pop">
            <legend className="visually-hidden">Figuren</legend>
            {book.characters.map((c) => (
              <label key={c.id} className="check-row">
                <input type="checkbox" checked={state.characterIds.includes(c.id)} onChange={() => toggleCharacter(c.id)} /> {c.name}
              </label>
            ))}
          </fieldset>
        </details>
      )}
      <label className="toggle-chip">
        <input type="checkbox" checked={state.showNotes} onChange={(e) => set({ showNotes: e.target.checked })} /> Notizen einblenden
      </label>
      <button type="button" className="filter-reset" disabled={!active} onClick={() => onChange({ ...defaultFilterState(), showNotes: state.showNotes })}>
        Filter zurücksetzen
      </button>
      <span className="filter-count" aria-live="polite">{visibleCount} von {book.storylines.length} Storylines</span>
    </form>
  );
}
