/** One chapter of the manuscript: title (rename), order, soft delete, its Bausteine and adding a new one (FR-002). */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MANUSCRIPT_LIMITS } from '@bookly/shared';
import type { Id, ManuscriptChapter, ManuscriptResponse } from '@bookly/shared';
import { Icon } from '../ui/Icon';
import { BlockCard, DeleteConfirm } from './BlockCard';
import { manuscriptError, useManuscriptMutation } from './manuscriptApi';

/** Renders chapter `index` of the manuscript. */
export function ChapterSection({ bookId, ms, chapter, index }: { bookId: Id; ms: ManuscriptResponse; chapter: ManuscriptChapter; index: number }) {
  const mutate = useManuscriptMutation(bookId);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(chapter.title);
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [blockTitle, setBlockTitle] = useState('');
  const structure = ms.rights.includes('structure');
  const canEdit = ms.rights.includes('edit');
  const [chapterEdit, setChapterEdit] = useState(0);
  const anyMine = chapter.blocks.some((b) => b.lock?.mine);
  const run = (c: Parameters<typeof mutate.mutate>[0], after?: () => void) => mutate.mutate(c, { onSuccess: () => after?.() });

  const rename = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim()) run({ method: 'PATCH', path: `/chapters/${chapter.id}`, body: { title: title.trim() } }, () => setRenaming(false));
  };
  const addBlock = (e: FormEvent) => {
    e.preventDefault();
    if (!blockTitle.trim()) return;
    run({ method: 'POST', path: '/blocks', body: { chapterId: chapter.id, title: blockTitle.trim() } }, () => {
      setBlockTitle('');
      setAdding(false);
    });
  };

  return (
    <section className="ms-chapter" id={`kapitel-${chapter.id}`} aria-labelledby={`kapitel-titel-${chapter.id}`}>
      <header className="ms-chapter-head">
        <span className="ms-chapter-number" aria-hidden="true">{index + 1}</span>
        {renaming ? (
          <form className="inline-form" onSubmit={rename}>
            <input aria-label="Kapiteltitel" value={title} maxLength={MANUSCRIPT_LIMITS.title} autoFocus onChange={(e) => setTitle(e.target.value)} />
            <button type="submit" className="primary">Speichern</button>
            <button type="button" onClick={() => { setTitle(chapter.title); setRenaming(false); }}>Abbrechen</button>
          </form>
        ) : (
          <h3 id={`kapitel-titel-${chapter.id}`} className="ms-chapter-title">{chapter.title}</h3>
        )}
        <span className="header-spacer" />
        {!renaming && (
          <div className="ms-chapter-tools">
            <Link className="link-button" to={`/books/${bookId}/manuskript/vorschau?kapitel=${chapter.id}`}>Vorschau</Link>
            {canEdit && chapter.blocks.length > 0 && (anyMine ? (
              <button type="button" className="ms-chapter-edit" onClick={() => run({ method: 'DELETE', path: `/chapters/${chapter.id}/lock` })}>Kapitel freigeben</button>
            ) : (
              <button type="button" className="ms-chapter-edit with-icon" onClick={() => run({ method: 'POST', path: `/chapters/${chapter.id}/lock` }, () => setChapterEdit((n) => n + 1))}>
                <Icon name="pencil" />Kapitel bearbeiten
              </button>
            ))}
          </div>
        )}
        {structure && !renaming && (
          <div className="ms-chapter-tools">
            <button type="button" className="icon-button" aria-label="Kapitel umbenennen" onClick={() => setRenaming(true)}><Icon name="pencil" /></button>
            <button type="button" className="icon-button" aria-label="Kapitel nach oben" disabled={index === 0} onClick={() => run({ method: 'POST', path: `/chapters/${chapter.id}/move`, body: { position: index - 1 } })}><Icon name="up" /></button>
            <button type="button" className="icon-button" aria-label="Kapitel nach unten" disabled={index === ms.chapters.length - 1} onClick={() => run({ method: 'POST', path: `/chapters/${chapter.id}/move`, body: { position: index + 1 } })}><Icon name="down" /></button>
            <button type="button" className="icon-button" aria-label="Kapitel löschen" onClick={() => setDeleting(true)}><Icon name="trash" /></button>
          </div>
        )}
      </header>
      {deleting && (
        <DeleteConfirm
          what="Kapitel"
          onCancel={() => setDeleting(false)}
          onConfirm={(comment) => run({ method: 'DELETE', path: `/chapters/${chapter.id}`, body: comment ? { comment } : {} }, () => setDeleting(false))}
        />
      )}
      {mutate.isError && <p className="error" role="alert">{manuscriptError(mutate.error)}</p>}
      {chapter.blocks.length === 0 && <p className="muted ms-empty-chapter">Dieses Kapitel hat noch keine Bausteine.</p>}
      <ol className="ms-blocks">
        {chapter.blocks.map((b, i) => <BlockCard key={b.id} bookId={bookId} ms={ms} chapter={chapter} block={b} index={i} chapterEdit={chapterEdit} />)}
      </ol>
      {structure && (adding ? (
        <form className="inline-form ms-add-block" onSubmit={addBlock}>
          <label>
            Neuer Baustein
            <input value={blockTitle} maxLength={MANUSCRIPT_LIMITS.title} autoFocus onChange={(e) => setBlockTitle(e.target.value)} placeholder="z. B. Ankunft am See" />
          </label>
          <button type="submit" className="primary">Anlegen</button>
          <button type="button" onClick={() => setAdding(false)}>Abbrechen</button>
        </form>
      ) : (
        <button type="button" className="link-button with-icon ms-add-link" onClick={() => setAdding(true)}><Icon name="plus" />Baustein hinzufügen</button>
      ))}
    </section>
  );
}
