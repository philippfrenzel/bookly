/**
 * Book-wide hint list at the top of the side panel: open contradictions first, each one able to
 * highlight its connection on the plan and open it; acknowledged hints fold away. Never blocks anything.
 */
import type { Book, Hint, Id } from '@bookly/shared';

interface Props {
  book: Book;
  hints: Hint[];
  /** Opens the connection (its dialog holds „Bewusst so“). */
  onShow: (connectionId: Id) => void;
  /** Highlights a connection on the plan (null clears). */
  onHighlight: (connectionId: Id | null) => void;
}

/** Route label „A → B“ of a connection, or empty when it no longer exists. */
function routeOf(book: Book, connectionId: Id): string {
  const c = book.connections.find((x) => x.id === connectionId);
  if (!c) return '';
  const title = (id: Id) => book.storylines.find((s) => s.id === id)?.title ?? '?';
  return `${title(c.fromId)} → ${title(c.toId)}`;
}

/** Renders the open hints as buttons and the acknowledged ones folded into a disclosure. */
export function BookHints({ book, hints, onShow, onHighlight }: Props) {
  const open = hints.filter((h) => !h.acknowledged);
  const acknowledged = hints.filter((h) => h.acknowledged);
  const item = (h: Hint) => (
    <li key={`${h.connectionId}:${h.rule}:${h.characterId ?? ''}`}>
      <button
        type="button"
        className={`book-hint${h.acknowledged ? ' is-acknowledged' : ''}`}
        onClick={() => onShow(h.connectionId)}
        onPointerEnter={() => onHighlight(h.connectionId)}
        onPointerLeave={() => onHighlight(null)}
        onFocus={() => onHighlight(h.connectionId)}
        onBlur={() => onHighlight(null)}
      >
        <span className="book-hint-route">{routeOf(book, h.connectionId)}</span>
        <span>{h.message}</span>
      </button>
    </li>
  );
  return (
    <section className="book-hints" aria-label="Hinweise im Buch">
      <h2>
        Hinweise{open.length > 0 && <span className="count-badge">{open.length}</span>}
      </h2>
      {open.length === 0 ? (
        <p className="all-clear">Keine offenen Widersprüche. Die Geschichte hält zusammen.</p>
      ) : (
        <ul>{open.map(item)}</ul>
      )}
      {acknowledged.length > 0 && (
        <details>
          <summary>{acknowledged.length} bewusst so belassen</summary>
          <ul>{acknowledged.map(item)}</ul>
        </details>
      )}
    </section>
  );
}
