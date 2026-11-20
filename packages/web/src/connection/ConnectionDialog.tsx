/** Modal for creating or editing a connection; contradiction hints are recomputed live from the draft. */
import { useMemo, useState } from 'react';
import {
  checkConnection, hintKey, strandCharacters, type Book, type Connection, type ConnectionType, type Hint, type Id,
} from '@bookly/shared';
import { useBookMutation } from '../api/hooks';
import { HintList } from './HintList';

/** What the dialog shows: a new connection between two storylines, or an existing one. */
export type ConnectionTarget = { mode: 'create'; fromId: Id; toId: Id } | { mode: 'edit'; id: Id };

/** German labels of the connection types, in display order. */
export const CONNECTION_TYPES: { type: ConnectionType; label: string }[] = [
  { type: 'character_switch', label: 'Figur wechselt' },
  { type: 'time_jump', label: 'Zeitsprung' },
  { type: 'merge', label: 'Handlungsstränge vereinigen sich' },
  { type: 'flashback', label: 'Rückblende' },
];

interface Props {
  book: Book;
  target: ConnectionTarget;
  onClose: () => void;
}

/** Resolves the target to its stored connection (edit) or a blank one; null when the connection vanished. */
function initialConnection(book: Book, target: ConnectionTarget): Connection | null {
  if (target.mode === 'edit') return book.connections.find((c) => c.id === target.id) ?? null;
  return { id: 'draft', fromId: target.fromId, toId: target.toId, type: 'time_jump', label: null, characterId: null };
}

/** Dialog shell; renders nothing when an edited connection no longer exists. */
export function ConnectionDialog({ book, target, onClose }: Props) {
  const initial = initialConnection(book, target);
  if (!initial) return null;
  return <DialogBody key={initial.id} book={book} initial={initial} isNew={target.mode === 'create'} onClose={onClose} />;
}

/** Form state, live hints and the save/delete/acknowledge mutations. */
function DialogBody({ book, initial, isNew, onClose }: { book: Book; initial: Connection; isNew: boolean; onClose: () => void }) {
  const [type, setType] = useState(initial.type);
  const [characterId, setCharacterId] = useState<Id | null>(initial.characterId);
  const [label, setLabel] = useState(initial.label ?? '');
  const base = `/api/books/${book.id}`;

  const from = book.storylines.find((s) => s.id === initial.fromId);
  const to = book.storylines.find((s) => s.id === initial.toId);

  const draft: Connection = {
    ...initial, type, characterId: type === 'character_switch' ? characterId : null, label: label.trim() === '' ? null : label.trim(),
  };

  // Recomputed on every change; the stored acknowledgements mark hints the author already accepted.
  const hints = useMemo<Hint[]>(() => {
    const acked = new Set(book.acknowledgements.map(hintKey));
    return checkConnection(book, draft).map((h) => ({ ...h, acknowledged: acked.has(hintKey(h)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, type, characterId, label]);

  const create = useBookMutation<Record<string, unknown>>(book.id, 'POST', () => `${base}/connections`, (v) => v);
  const update = useBookMutation<Record<string, unknown>>(book.id, 'PATCH', () => `${base}/connections/${initial.id}`, (v) => v);
  const remove = useBookMutation<void>(book.id, 'DELETE', () => `${base}/connections/${initial.id}`);
  const ack = useBookMutation<Hint>(book.id, 'POST', () => `${base}/acknowledgements`, ackBody);
  const unack = useBookMutation<Hint>(book.id, 'DELETE', () => `${base}/acknowledgements`, ackBody);

  const pending = create.isPending || update.isPending || remove.isPending;

  const save = () => {
    const common = { type, label: draft.label, characterId: draft.characterId };
    if (isNew) create.mutate({ fromId: initial.fromId, toId: initial.toId, ...common }, { onSuccess: onClose });
    else update.mutate(common, { onSuccess: onClose });
  };
  const confirmDelete = () => {
    if (window.confirm('Verbindung löschen?')) remove.mutate(undefined, { onSuccess: onClose });
  };

  // Union of both strands' characters first, then everybody else.
  const inStrands = new Set([...(from ? strandCharacters(from) : []), ...(to ? strandCharacters(to) : [])]);
  const preferred = book.characters.filter((c) => inStrands.has(c.id));
  const others = book.characters.filter((c) => !inStrands.has(c.id));

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Verbindung">
        <p className="muted">
          „{from?.title}“ → „{to?.title}“
        </p>
        <label>
          Art
          <select value={type} onChange={(e) => setType(e.target.value as ConnectionType)}>
            {CONNECTION_TYPES.map((t) => (
              <option key={t.type} value={t.type}>{t.label}</option>
            ))}
          </select>
        </label>
        {type === 'character_switch' && (
          <label>
            Figur
            <select value={characterId ?? ''} onChange={(e) => setCharacterId(e.target.value || null)}>
              <option value="">– Figur wählen –</option>
              {preferred.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              {others.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Beschriftung
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <HintList
          hints={hints}
          onAcknowledge={isNew ? undefined : (h) => ack.mutate(h)}
          onReopen={isNew ? undefined : (h) => unack.mutate(h)}
        />
        <div className="actions">
          <button type="button" disabled={pending} onClick={save}>Speichern</button>
          {!isNew && <button type="button" disabled={pending} onClick={confirmDelete}>Löschen</button>}
          <button type="button" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

/** Request body identifying one acknowledgement. */
function ackBody(h: Hint) {
  return { connectionId: h.connectionId, rule: h.rule, characterId: h.characterId };
}
