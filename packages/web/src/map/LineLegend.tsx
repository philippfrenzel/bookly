/** Line legend above the map: one signet chip per storyline, main lines first; hover highlights, click selects. */
import { orderIndex, type Book, type Id } from '@bookly/shared';
import { useMemo } from 'react';
import { inkOn, lineSignets } from './signets';

interface Props {
  book: Book;
  /** Storylines passing the current filter; others render as filtered out. */
  visibleIds: Set<Id>;
  selectedId: Id | null;
  onSelect: (id: Id) => void;
  onHighlight: (id: Id | null) => void;
}

/** Renders the signet chips in signet order (H1, H2 … then N1, N2 …). */
export function LineLegend({ book, visibleIds, selectedId, onSelect, onHighlight }: Props) {
  const signets = useMemo(() => lineSignets(book.storylines, orderIndex(book.timePoints)), [book.storylines, book.timePoints]);
  const ordered = useMemo(
    () =>
      [...book.storylines].sort((a, b) => {
        const sa = signets.get(a.id) ?? '';
        const sb = signets.get(b.id) ?? '';
        return sa[0] === sb[0] ? Number(sa.slice(1)) - Number(sb.slice(1)) : sa < sb ? -1 : 1;
      }),
    [book.storylines, signets],
  );
  if (ordered.length === 0) return null;
  return (
    <nav className="line-legend" aria-label="Linien">
      {ordered.map((s) => {
        const shown = visibleIds.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            className={`line-chip${s.id === selectedId ? ' is-selected' : ''}${shown ? '' : ' is-filtered'}`}
            aria-pressed={s.id === selectedId}
            title={shown ? undefined : 'Durch Filter ausgeblendet'}
            onClick={() => onSelect(s.id)}
            onPointerEnter={() => shown && onHighlight(s.id)}
            onPointerLeave={() => onHighlight(null)}
            onFocus={() => shown && onHighlight(s.id)}
            onBlur={() => onHighlight(null)}
          >
            <span className={`signet-badge${s.kind === 'main' ? ' is-main' : ''}`} style={{ background: s.color, color: inkOn(s.color) }}>
              {signets.get(s.id)}
            </span>
            {s.title}
          </button>
        );
      })}
    </nav>
  );
}
