/** Modal for creating or editing a connection; contradiction hints are recomputed live from the draft. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  characterLabel, checkConnection, hintKey, strandCharacters, type Book, type Connection, type ConnectionType, type Hint, type Id,
  type ValidationIssue,
} from '@bookly/shared';
import type { ApiError } from '../api/client';
import { IssueList } from '../book/IssueList';
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

  // Recomputed on every change; the stored acknowledgements mark hints the author already accepted.
  const { draft, hints } = useMemo(() => {
    const d: Connection = {
      ...initial, type, characterId: type === 'character_switch' ? characterId : null, label: label.trim() === '' ? null : label.trim(),
    };
    const acked = new Set(book.acknowledgements.map(hintKey));
    return { draft: d, hints: checkConnection(book, d).map((h) => ({ ...h, acknowledged: acked.has(hintKey(h)) })) as Hint[] };
  }, [book, initial, type, characterId, label]);
  // Acknowledgements target the stored connection, so they are only offered while the draft matches it.
  const unchanged = draft.type === initial.type && draft.characterId === initial.characterId && draft.label === initial.label;

  const [error, setError] = useState<{ issues?: ValidationIssue[]; message?: string } | null>(null);
  const onError = (e: ApiError) => {
    const body = e.body as { issues?: ValidationIssue[] } | undefined;
    if (e.status === 422 && body?.issues) setError({ issues: body.issues });
    else setError({ message: 'Speichern fehlgeschlagen. Bitte erneut versuchen.' });
  };
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => dialogRef.current?.focus(), []);

  const create = useBookMutation<Record<string, unknown>>(book.id, 'POST', () => `${base}/connections`, (v) => v);
  const update = useBookMutation<Record<string, unknown>>(book.id, 'PATCH', () => `${base}/connections/${initial.id}`, (v) => v);
  const remove = useBookMutation<void>(book.id, 'DELETE', () => `${base}/connections/${initial.id}`);
  const ack = useBookMutation<Hint>(book.id, 'POST', () => `${base}/acknowledgements`, ackBody);
  const unack = useBookMutation<Hint>(book.id, 'DELETE', () => `${base}/acknowledgements`, ackBody);

  const pending = create.isPending || update.isPending || remove.isPending;

  const save = () => {
    const common = { type, label: draft.label, characterId: draft.characterId };
    if (isNew) create.mutate({ fromId: initial.fromId, toId: initial.toId, ...common }, { onSuccess: onClose, onError });
    else update.mutate(common, { onSuccess: onClose, onError });
  };
  const confirmDelete = () => {
    if (window.confirm('Verbindung löschen?')) remove.mutate(undefined, { onSuccess: onClose, onError });
  };

  // Union of both strands' characters first, then everybody else.
  const inStrands = new Set([...(from ? strandCharacters(from) : []), ...(to ? strandCharacters(to) : [])]);
  const preferred = book.characters.filter((c) => inStrands.has(c.id));
  const others = book.characters.filter((c) => !inStrands.has(c.id));

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Verbindung"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <h2 className="modal-title">{isNew ? 'Neue Verbindung' : 'Verbindung bearbeiten'}</h2>
        <p className="modal-route">
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
                <option key={c.id} value={c.id}>{characterLabel(c)}</option>
              ))}
              {others.map((c) => (
                <option key={c.id} value={c.id}>{characterLabel(c)}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Beschriftung
          <input value={label} maxLength={200} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <HintList
          hints={hints}
          onAcknowledge={isNew || !unchanged ? undefined : (h) => ack.mutate(h, { onError })}
          onReopen={isNew || !unchanged ? undefined : (h) => unack.mutate(h, { onError })}
        />
        <IssueList issues={error?.issues ?? []} />
        {error?.message && <p className="error" role="alert">{error.message}</p>}
        <div className="modal-actions">
          {!isNew && <button type="button" className="danger-quiet" disabled={pending} onClick={confirmDelete}>Löschen</button>}
          <span className="header-spacer" />
          <button type="button" onClick={onClose}>Abbrechen</button>
          <button type="button" className="primary" disabled={pending} onClick={save}>Speichern</button>
        </div>
      </div>
    </div>
  );
}

/** Request body identifying one acknowledgement. */
function ackBody(h: Hint) {
  return { connectionId: h.connectionId, rule: h.rule, characterId: h.characterId };
}
