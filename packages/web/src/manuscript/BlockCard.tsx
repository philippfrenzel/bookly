/**
 * One Baustein: its sources, plan and prose; editing with a lock (FR-007), the lock badge (FR-008, FR-013),
 * the author's unlock (FR-010), moving, soft delete with comment (FR-021) and the version list (FR-004).
 */
import { useEffect, useRef, useState } from 'react';
import { MANUSCRIPT_LIMITS } from '@bookly/shared';
import type { Id, ManuscriptBlock, ManuscriptChapter, ManuscriptResponse } from '@bookly/shared';
import { Icon } from '../ui/Icon';
import { BlockVersions } from './BlockVersions';
import { isLocked, manuscriptError, useBlockDraft, useManuscriptMutation } from './manuscriptApi';

interface Props {
  bookId: Id;
  ms: ManuscriptResponse;
  chapter: ManuscriptChapter;
  block: ManuscriptBlock;
  index: number;
}

/** Shows a block; switches to the editor while the caller holds its lock. */
export function BlockCard({ bookId, ms, chapter, block, index }: Props) {
  const mutate = useManuscriptMutation(bookId);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const can = (r: string) => ms.rights.includes(r as never);
  const foreignLock = block.lock !== null && !block.lock.mine;
  const call = (c: Parameters<typeof mutate.mutate>[0], after?: () => void) => {
    setNotice(null);
    mutate.mutate(c, { onSuccess: () => after?.(), onError: (e) => setNotice(manuscriptError(e)) });
  };
  const startEdit = () => {
    setNotice(null);
    mutate.mutate(
      { method: 'POST', path: `/blocks/${block.id}/lock` },
      { onSuccess: () => setEditing(true), onError: (e) => setNotice(manuscriptError(e)) },
    );
  };
  const others = ms.chapters.filter((c) => c.id !== chapter.id);

  return (
    <li className={`ms-block${foreignLock ? ' is-locked' : ''}`} aria-label={`Baustein ${block.title}`}>
      {editing ? (
        <BlockEditor bookId={bookId} block={block} onClose={(msg) => { setEditing(false); setNotice(msg ?? null); }} />
      ) : (
        <>
          <div className="ms-block-head">
            <h4>{block.title}</h4>
            {foreignLock && (
              <span className="lock-badge" role="status">
                <Icon name="lock" />Gesperrt
              </span>
            )}
            <span className="ms-block-version" title="Aktuelle Version">v{block.version}</span>
          </div>
          <Sources ms={ms} block={block} />
          {block.synopsis && <p className="ms-synopsis"><span className="scene-label">Inhalt</span> {block.synopsis}</p>}
          {block.text ? <div className="ms-text">{block.text}</div> : <p className="muted ms-text-empty">Noch kein Text.</p>}
          <div className="ms-block-actions">
            {can('edit') && (
              <button type="button" className="with-icon" disabled={foreignLock || mutate.isPending} title={foreignLock ? 'Wird gerade bearbeitet.' : undefined} onClick={startEdit}>
                <Icon name="pencil" />Bearbeiten
              </button>
            )}
            {foreignLock && ms.role === 'author' && (
              <button type="button" onClick={() => call({ method: 'DELETE', path: `/blocks/${block.id}/lock` })}>Sperre aufheben</button>
            )}
            <button type="button" className="link-button" aria-expanded={showVersions} onClick={() => setShowVersions((v) => !v)}>
              Versionen
            </button>
            <span className="header-spacer" />
            {can('structure') && (
              <>
                <button type="button" className="icon-button" aria-label="Nach oben" disabled={index === 0 || foreignLock} onClick={() => call({ method: 'POST', path: `/blocks/${block.id}/move`, body: { position: index - 1 } })}>
                  <Icon name="up" />
                </button>
                <button type="button" className="icon-button" aria-label="Nach unten" disabled={index === chapter.blocks.length - 1 || foreignLock} onClick={() => call({ method: 'POST', path: `/blocks/${block.id}/move`, body: { position: index + 1 } })}>
                  <Icon name="down" />
                </button>
                {others.length > 0 && (
                  <select
                    aria-label="In Kapitel verschieben"
                    className="ms-move"
                    value=""
                    disabled={foreignLock}
                    onChange={(e) => e.target.value && call({ method: 'POST', path: `/blocks/${block.id}/move`, body: { chapterId: e.target.value, position: 10_000 } })}
                  >
                    <option value="">Verschieben nach …</option>
                    {others.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                )}
              </>
            )}
            {can('delete') && (
              <button type="button" className="icon-button" aria-label="Baustein löschen" disabled={foreignLock} onClick={() => setDeleting(true)}>
                <Icon name="trash" />
              </button>
            )}
          </div>
          {deleting && (
            <DeleteConfirm
              what="Baustein"
              onCancel={() => setDeleting(false)}
              onConfirm={(comment) => call({ method: 'DELETE', path: `/blocks/${block.id}`, body: comment ? { comment } : {} }, () => setDeleting(false))}
            />
          )}
          {showVersions && <BlockVersions bookId={bookId} block={block} canRestore={can('edit') && !foreignLock} />}
        </>
      )}
      {notice && <p className="error" role="alert">{notice}</p>}
    </li>
  );
}

/** Where a block comes from: storyline or section in its line colour, and its scenes. */
function Sources({ ms, block }: { ms: ManuscriptResponse; block: ManuscriptBlock }) {
  const section = ms.context.sections.find((s) => s.id === block.sectionId);
  const line = ms.context.storylines.find((l) => l.id === (block.storylineId ?? section?.storylineId));
  const scenes = ms.context.scenes.filter((s) => block.sceneIds.includes(s.id));
  if (!line && scenes.length === 0) return null;
  return (
    <div className="ms-sources">
      {line && (
        <span className="scene-chip" style={{ ['--chip' as string]: line.color }}>
          <span className="continue-dot" style={{ background: line.color }} aria-hidden="true" />
          {line.title}{section && ` · ${section.title}`}
        </span>
      )}
      {scenes.map((s) => <span key={s.id} className="scene-chip ms-scene-chip">{s.name}</span>)}
    </div>
  );
}

/** Optional comment and confirmation for a soft delete. */
export function DeleteConfirm({ what, onCancel, onConfirm }: { what: string; onCancel: () => void; onConfirm: (comment: string) => void }) {
  const [comment, setComment] = useState('');
  return (
    <div className="ms-confirm" role="group" aria-label={`${what} löschen`}>
      <label>
        Kommentar (optional)
        <input value={comment} maxLength={MANUSCRIPT_LIMITS.comment} onChange={(e) => setComment(e.target.value)} placeholder="Warum fliegt das raus?" />
      </label>
      <p className="muted">Gelöschtes landet im Papierkorb und kann wiederhergestellt werden.</p>
      <div className="actions">
        <button type="button" className="danger-quiet" onClick={() => onConfirm(comment.trim())}>{what} löschen</button>
        <button type="button" onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}

/**
 * The editor while the caller holds the lock. If the lock goes away meanwhile (author unlock or timeout), the change
 * is saved right away when possible, else the text stays here with a warning (EC-002).
 */
function BlockEditor({ bookId, block, onClose }: { bookId: Id; block: ManuscriptBlock; onClose: (notice?: string) => void }) {
  const mutate = useManuscriptMutation(bookId);
  const draft = useBlockDraft(bookId);
  const [title, setTitle] = useState(block.title);
  const [synopsis, setSynopsis] = useState(block.synopsis);
  const [text, setText] = useState(block.text);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const base = useRef(block.version);
  const lostHandled = useRef(false);
  const dirty = title !== block.title || synopsis !== block.synopsis || text !== block.text;

  const save = (after: 'close' | 'lost') => {
    if (!title.trim()) return setWarning('Der Titel darf nicht leer sein.');
    mutate.mutate(
      { method: 'PATCH', path: `/blocks/${block.id}`, body: { baseVersion: base.current, title: title.trim(), synopsis, text } },
      {
        onSuccess: () => {
          if (after === 'lost') return onClose('Deine Sperre wurde aufgehoben. Deine Änderungen wurden gespeichert.');
          mutate.mutate({ method: 'DELETE', path: `/blocks/${block.id}/lock` });
          onClose();
        },
        onError: (e) => setWarning(isLocked(e)
          ? 'Jemand anderes bearbeitet diesen Baustein jetzt. Deine Änderungen sind nicht gespeichert: kopiere deinen Text, bevor du schließt.'
          : manuscriptError(e)),
      },
    );
  };

  // The lock is gone (released by the author or timed out): save if there is something to save (EC-002).
  useEffect(() => {
    if (block.lock?.mine || lostHandled.current) return;
    lostHandled.current = true;
    if (dirty) save('lost');
    else setWarning('Deine Sperre wurde aufgehoben. Starte die Bearbeitung neu, um weiterzuschreiben.');
  }, [block.lock]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = () => {
    if (block.lock?.mine) mutate.mutate({ method: 'DELETE', path: `/blocks/${block.id}/lock` });
    onClose();
  };

  return (
    <form className="ms-editor" onSubmit={(e) => { e.preventDefault(); save('close'); }} aria-label={`Baustein ${block.title} bearbeiten`}>
      <label>
        Titel
        <input value={title} maxLength={MANUSCRIPT_LIMITS.title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Inhalt (Plan)
        <textarea rows={2} value={synopsis} maxLength={MANUSCRIPT_LIMITS.synopsis} onChange={(e) => setSynopsis(e.target.value)} />
      </label>
      <label>
        Text
        <textarea className="ms-text-input" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {suggestion !== null && (
        <figure className="scene-sample" aria-label="KI-Entwurf">
          <figcaption className="scene-label">KI-Entwurf</figcaption>
          <p className="ms-text">{suggestion}</p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => { setText(suggestion); setSuggestion(null); }}>Übernehmen</button>
            <button type="button" onClick={() => setSuggestion(null)}>Verwerfen</button>
          </div>
          <p className="muted">Übernehmen ersetzt den Text im Editor; gespeichert wird erst mit „Speichern“.</p>
        </figure>
      )}
      {warning && <p className="error" role="alert">{warning}</p>}
      {draft.isError && <p className="error" role="alert">{manuscriptError(draft.error)}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={mutate.isPending}>Speichern</button>
        <button type="button" onClick={cancel}>Abbrechen</button>
        <button type="button" className="with-icon" disabled={draft.isPending} onClick={() => draft.mutate(block.id, { onSuccess: (r) => setSuggestion(r.text) })}>
          <Icon name="wand" />{draft.isPending ? 'Schreibe …' : 'KI-Entwurf'}
        </button>
        {block.lock?.mine && <span className="muted ms-lock-note"><Icon name="lock" /> Für andere gesperrt bis {time(block.lock.expiresAt)}</span>}
      </div>
    </form>
  );
}

/** „14:05“ in local time. */
function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
