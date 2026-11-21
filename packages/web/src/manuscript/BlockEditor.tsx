/**
 * Editor for one Baustein. `edit`: the caller holds the lock and saves a new version; if the lock goes away meanwhile
 * (author unlock or timeout) the change is saved right away when possible, else the text stays here with a warning
 * (EC-002). `suggest`: a reviewer without the edit right proposes new content for the author to confirm (FR-023).
 */
import { useEffect, useRef, useState } from 'react';
import { MANUSCRIPT_LIMITS } from '@bookly/shared';
import type { Id, ManuscriptBlock } from '@bookly/shared';
import { Icon } from '../ui/Icon';
import { isLocked, manuscriptError, useBlockDraft, useManuscriptMutation } from './manuscriptApi';

interface Props {
  bookId: Id;
  block: ManuscriptBlock;
  mode: 'edit' | 'suggest';
  onClose: (notice?: string) => void;
}

/** Shows the editor form. */
export function BlockEditor({ bookId, block, mode, onClose }: Props) {
  const mutate = useManuscriptMutation(bookId);
  const draft = useBlockDraft(bookId);
  const [title, setTitle] = useState(block.title);
  const [synopsis, setSynopsis] = useState(block.synopsis);
  const [text, setText] = useState(block.text);
  const [instruction, setInstruction] = useState(block.instruction);
  const [note, setNote] = useState('');
  const [aiText, setAiText] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const base = useRef(block.version);
  const lostHandled = useRef(false);
  const dirty = title !== block.title || synopsis !== block.synopsis || text !== block.text;
  const onError = (e: unknown) => setWarning(isLocked(e)
    ? 'Jemand anderes bearbeitet diesen Baustein jetzt. Deine Änderungen sind nicht gespeichert: kopiere deinen Text, bevor du schließt.'
    : manuscriptError(e));

  const saveContent = (after: 'close' | 'lost') => {
    const body = { baseVersion: base.current, title: title.trim(), synopsis, text };
    if (mode === 'suggest') {
      mutate.mutate({ method: 'POST', path: `/blocks/${block.id}/suggestions`, body: { ...body, ...(note.trim() && { note: note.trim() }) } }, {
        onSuccess: () => onClose('Dein Vorschlag ist beim Autor. Er entscheidet, ob er ihn übernimmt.'),
        onError,
      });
      return;
    }
    mutate.mutate({ method: 'PATCH', path: `/blocks/${block.id}`, body }, {
      onSuccess: () => {
        if (after === 'lost') return onClose('Deine Sperre wurde aufgehoben. Deine Änderungen wurden gespeichert.');
        mutate.mutate({ method: 'DELETE', path: `/blocks/${block.id}/lock` });
        onClose();
      },
      onError,
    });
  };

  const save = (after: 'close' | 'lost') => {
    if (!title.trim()) return setWarning('Der Titel darf nicht leer sein.');
    if (mode === 'edit' && instruction.trim() !== block.instruction) {
      mutate.mutate({ method: 'PUT', path: `/blocks/${block.id}/instruction`, body: { instruction: instruction.trim() } }, {
        onSuccess: () => saveContent(after),
        onError,
      });
    } else saveContent(after);
  };

  // The lock is gone (released by the author or timed out): save if there is something to save (EC-002).
  useEffect(() => {
    if (mode !== 'edit' || block.lock?.mine || lostHandled.current) return;
    lostHandled.current = true;
    if (dirty) save('lost');
    else setWarning('Deine Sperre wurde aufgehoben. Starte die Bearbeitung neu, um weiterzuschreiben.');
  }, [block.lock]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = () => {
    if (mode === 'edit' && block.lock?.mine) mutate.mutate({ method: 'DELETE', path: `/blocks/${block.id}/lock` });
    onClose();
  };
  const label = mode === 'edit' ? `Baustein ${block.title} bearbeiten` : `Vorschlag für ${block.title}`;

  return (
    <form className="ms-editor" onSubmit={(e) => { e.preventDefault(); save('close'); }} aria-label={label}>
      {mode === 'suggest' && <p className="muted">Dein Vorschlag ändert nichts, bis der Autor ihn übernimmt.</p>}
      <label>
        Titel
        <input value={title} maxLength={MANUSCRIPT_LIMITS.title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Inhalt (Plan)
        <textarea rows={2} value={synopsis} maxLength={MANUSCRIPT_LIMITS.synopsis} onChange={(e) => setSynopsis(e.target.value)} />
      </label>
      {mode === 'edit' && (
        <label>
          Anweisung für diesen Baustein
          <textarea rows={2} value={instruction} maxLength={MANUSCRIPT_LIMITS.instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="z. B. aus Miras Sicht, kurze Sätze, endet mit einem Cliffhanger" />
        </label>
      )}
      <label>
        Text
        <textarea className="ms-text-input" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {mode === 'suggest' && (
        <label>
          Notiz an den Autor (optional)
          <input value={note} maxLength={MANUSCRIPT_LIMITS.comment} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      {aiText !== null && (
        <figure className="scene-sample" aria-label="KI-Entwurf">
          <figcaption className="scene-label">KI-Entwurf</figcaption>
          <p className="ms-text">{aiText}</p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => { setText(aiText); setAiText(null); }}>Übernehmen</button>
            <button type="button" onClick={() => setAiText(null)}>Verwerfen</button>
          </div>
          <p className="muted">Übernehmen ersetzt den Text im Editor; gespeichert wird erst mit „Speichern“. Eine geänderte Anweisung wirkt nach dem Speichern.</p>
        </figure>
      )}
      {warning && <p className="error" role="alert">{warning}</p>}
      {draft.isError && <p className="error" role="alert">{manuscriptError(draft.error)}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={mutate.isPending}>{mode === 'edit' ? 'Speichern' : 'Vorschlag senden'}</button>
        <button type="button" onClick={cancel}>Abbrechen</button>
        {mode === 'edit' && (
          <button type="button" className="with-icon" disabled={draft.isPending} onClick={() => draft.mutate(block.id, { onSuccess: (r) => setAiText(r.text) })}>
            <Icon name="wand" />{draft.isPending ? 'Schreibe …' : 'KI-Entwurf'}
          </button>
        )}
        {mode === 'edit' && block.lock?.mine && <span className="muted ms-lock-note"><Icon name="lock" /> Für andere gesperrt bis {time(block.lock.expiresAt)}</span>}
      </div>
    </form>
  );
}

/** „14:05“ in local time. */
function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
