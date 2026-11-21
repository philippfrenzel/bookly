/**
 * One Baustein: its sources, plan and prose; editing with a lock (FR-007), the lock badge (FR-008, FR-013),
 * the author's unlock (FR-010), moving, soft delete with comment (FR-021) and the version list (FR-004).
 */
import { useEffect, useRef, useState } from 'react';
import { MANUSCRIPT_LIMITS } from '@bookly/shared';
import type { Id, ManuscriptBlock, ManuscriptChapter, ManuscriptResponse } from '@bookly/shared';
import { Icon } from '../ui/Icon';
import { BlockComments } from './BlockComments';
import { BlockEditor } from './BlockEditor';
import { BlockSuggestions } from './BlockSuggestions';
import { BlockVersions } from './BlockVersions';
import { manuscriptError, useManuscriptMutation } from './manuscriptApi';

interface Props {
  bookId: Id;
  ms: ManuscriptResponse;
  chapter: ManuscriptChapter;
  block: ManuscriptBlock;
  index: number;
  /** Bumped when the whole chapter was locked for editing; opens the editor if the lock is the caller's (FR-012). */
  chapterEdit?: number;
}

/** Shows a block; switches to the editor while the caller holds its lock. */
export function BlockCard({ bookId, ms, chapter, block, index, chapterEdit = 0 }: Props) {
  const mutate = useManuscriptMutation(bookId);
  const [editing, setEditing] = useState<'edit' | 'suggest' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
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
      { onSuccess: () => setEditing('edit'), onError: (e) => setNotice(manuscriptError(e)) },
    );
  };
  const others = ms.chapters.filter((c) => c.id !== chapter.id);
  // Open the editor once per chapter-lock request, as soon as the fresh data shows the lock as ours.
  const openedFor = useRef(0);
  useEffect(() => {
    if (chapterEdit > openedFor.current && block.lock?.mine) {
      openedFor.current = chapterEdit;
      setEditing('edit');
    }
  }, [chapterEdit, block.lock?.mine]);

  return (
    <li className={`ms-block${foreignLock ? ' is-locked' : ''}`} aria-label={`Baustein ${block.title}`}>
      {editing ? (
        <BlockEditor bookId={bookId} block={block} mode={editing} onClose={(msg) => { setEditing(null); setInfo(msg ?? null); }} />
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
          {block.instruction && <p className="ms-synopsis"><span className="scene-label">Anweisung</span> {block.instruction}</p>}
          {block.text ? <div className="ms-text">{block.text}</div> : <p className="muted ms-text-empty">Noch kein Text.</p>}
          <div className="ms-block-actions">
            {can('edit') && (
              <button type="button" className="with-icon" disabled={foreignLock || mutate.isPending} title={foreignLock ? 'Wird gerade bearbeitet.' : undefined} onClick={startEdit}>
                <Icon name="pencil" />Bearbeiten
              </button>
            )}
            {!can('edit') && can('suggest') && (
              <button type="button" className="with-icon" onClick={() => { setInfo(null); setEditing('suggest'); }}>
                <Icon name="pencil" />Vorschlag machen
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
          {block.suggestions.length > 0 && <BlockSuggestions bookId={bookId} ms={ms} block={block} foreignLock={foreignLock} />}
          {(block.comments.length > 0 || can('comment')) && <BlockComments bookId={bookId} ms={ms} block={block} />}
        </>
      )}
      {info && <p className="ms-info" role="status">{info}</p>}
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
