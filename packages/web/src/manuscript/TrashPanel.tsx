/** Trash tab: soft-deleted chapters and Bausteine with their comment; restorable with the matching right (FR-025). */
import type { Id, ManuscriptResponse, TrashItem } from '@bookly/shared';
import { manuscriptError, useManuscriptMutation } from './manuscriptApi';

/** Lists the trash of the manuscript. */
export function TrashPanel({ bookId, ms }: { bookId: Id; ms: ManuscriptResponse }) {
  const mutate = useManuscriptMutation(bookId);
  const canRestore = (item: TrashItem) => ms.rights.includes(item.kind === 'chapter' ? 'structure' : 'delete');
  if (ms.trash.length === 0) return <p className="muted">Der Papierkorb ist leer.</p>;
  return (
    <div className="ms-panel">
      <ul className="panel-list ms-trash">
        {ms.trash.map((item) => (
          <li key={item.id}>
            <div className="ms-trash-body">
              <strong>{item.title}</strong>
              <span className="muted">
                {item.kind === 'chapter' ? 'Kapitel' : `Baustein${item.chapterTitle ? ` aus „${item.chapterTitle}“` : ''}`}
                {' · gelöscht am '}{new Date(item.deletedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              {item.comment && <q className="ms-trash-comment">{item.comment}</q>}
            </div>
            {canRestore(item) && (
              <button type="button" disabled={mutate.isPending} onClick={() => mutate.mutate({ method: 'POST', path: `/${item.kind === 'chapter' ? 'chapters' : 'blocks'}/${item.id}/restore` })}>
                Wiederherstellen
              </button>
            )}
          </li>
        ))}
      </ul>
      {mutate.isError && <p className="error" role="alert">{manuscriptError(mutate.error)}</p>}
    </div>
  );
}
