/**
 * Book-wide hint list at the top of the side panel: open contradictions first, each one able to
 * highlight its connection on the plan and open it; acknowledged hints fold away. Never blocks anything.
 */
import { useState } from 'react';
import type { Book, CharacterWarning, Hint, Id } from '@bookly/shared';
import { useBookMutation } from '../api/hooks';
import { CharacterWarningItem } from './CharacterWarningItem';

interface Props {
  book: Book;
  hints: Hint[];
  /** AI character warnings for the whole book. */
  warnings: CharacterWarning[];
  /** Whether „Alle prüfen“ can run. */
  aiEnabled: boolean;
  /** Opens a storyline in the side panel. */
  onShowStoryline: (storylineId: Id) => void;
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
export function BookHints({ book, hints, warnings, aiEnabled, onShowStoryline, onShow, onHighlight }: Props) {
  const checkAll = useBookMutation<void>(book.id, 'POST', () => `/api/books/${book.id}/character-checks`);
  const [checkFailed, setCheckFailed] = useState(false);
  const startCheckAll = () =>
    checkAll.mutate(undefined, { onError: () => setCheckFailed(true), onSuccess: () => setCheckFailed(false) });
  const open = hints.filter((h) => !h.acknowledged);
  const acknowledged = hints.filter((h) => h.acknowledged);
  const openWarnings = warnings.filter((w) => !w.acknowledged);
  const ackWarnings = warnings.filter((w) => w.acknowledged);
  const openCount = open.length + openWarnings.length;
  const ackCount = acknowledged.length + ackWarnings.length;
  const warningItem = (w: CharacterWarning) => (
    <CharacterWarningItem key={w.id} book={book} warning={w} onShowStoryline={onShowStoryline} />
  );
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
        Hinweise{openCount > 0 && <span className="count-badge">{openCount}</span>}
      </h2>
      {openCount === 0 ? (
        <p className="all-clear">Keine offenen Widersprüche. Die Geschichte hält zusammen.</p>
      ) : (
        open.length > 0 && <ul>{open.map(item)}</ul>
      )}
      <div className="book-hints-group">
        <h3>Figuren</h3>
        <button type="button" disabled={!aiEnabled || checkAll.isPending} onClick={startCheckAll}>
          Alle prüfen
        </button>
      </div>
      {checkFailed && <p className="error" role="alert">Prüfung konnte nicht gestartet werden.</p>}
      {openWarnings.length > 0 && <ul>{openWarnings.map(warningItem)}</ul>}
      {ackCount > 0 && (
        <details>
          <summary>{ackCount} bewusst so belassen</summary>
          <ul>{acknowledged.map(item)}{ackWarnings.map(warningItem)}</ul>
        </details>
      )}
    </section>
  );
}
