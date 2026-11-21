/** Connections of one storyline: the existing ones (each opens its dialog) and a picker to add another. */
import { useState } from 'react';
import type { Book, Id } from '@bookly/shared';
import { CONNECTION_TYPES } from '../connection/ConnectionDialog';
import { signetOf, SignetChip } from './StorylineHeader';

interface Props {
  book: Book;
  storylineId: Id;
  /** Opens the connection dialog from this storyline to another. */
  onConnect: (fromId: Id, toId: Id) => void;
  /** Opens an existing connection. */
  onOpen?: (connectionId: Id) => void;
}

/** Lists the storyline's connections with their partner line and type. */
export function StorylineConnections({ book, storylineId, onConnect, onOpen }: Props) {
  const own = book.connections.filter((c) => c.fromId === storylineId || c.toId === storylineId);
  return (
    <section className="storyline-connections" aria-label="Verbindungen">
      <h3>Verbindungen</h3>
      {own.length === 0 && <p className="muted">Noch keine Verbindungen.</p>}
      {own.length > 0 && (
        <ul className="connection-list">
          {own.map((c) => {
            const otherId = c.fromId === storylineId ? c.toId : c.fromId;
            const other = book.storylines.find((s) => s.id === otherId);
            const type = CONNECTION_TYPES.find((t) => t.type === c.type)?.label ?? c.type;
            return (
              <li key={c.id}>
                <button type="button" className="connection-item" disabled={!onOpen} onClick={() => onOpen?.(c.id)}>
                  <span aria-hidden="true">{c.fromId === storylineId ? '→' : '←'}</span>
                  {other && <SignetChip color={other.color} signet={signetOf(book, other.id)} />}
                  <span>{other?.title ?? '?'}</span>
                  <span className="muted">· {c.label ?? type}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ConnectPicker book={book} fromId={storylineId} onConnect={onConnect} />
    </section>
  );
}

/** Accessible alternative to dragging a bar handle: pick the target strand and open the connection dialog. */
function ConnectPicker({ book, fromId, onConnect }: { book: Book; fromId: Id; onConnect: (fromId: Id, toId: Id) => void }) {
  const [toId, setToId] = useState('');
  return (
    <div className="connect-picker inline">
      <label>
        Verbinden mit …
        <select value={toId} onChange={(e) => setToId(e.target.value)}>
          <option value="" />
          {book.storylines.filter((s) => s.id !== fromId).map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
      </label>
      <button type="button" disabled={!toId} onClick={() => onConnect(fromId, toId)}>Verbinden</button>
    </div>
  );
}
