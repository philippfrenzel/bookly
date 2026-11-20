/** Time point management: list, inline rename, insert, reorder (drag & drop or buttons), delete. */
import { useState } from 'react';
import { timePointUsages, validateBook } from '@bookly/shared';
import type { Book, Id, TimePointUsage, ValidationIssue } from '@bookly/shared';
import { ApiError } from '../api/client';
import { useBookMutation } from '../api/hooks';
import { IssueList } from './IssueList';

/** Renders the usages that block deleting a time point. */
function UsageList({ usages }: { usages: TimePointUsage[] }) {
  return (
    <div className="issues" role="alert">
      <p className="error">Dieser Zeitpunkt wird noch verwendet:</p>
      <ul>
        {usages.map((u) => (
          <li key={`${u.kind}-${u.id}`}>{`${u.kind === 'storyline' ? 'Storyline' : 'Abschnitt'} „${u.title}“`}</li>
        ))}
      </ul>
    </div>
  );
}

/** Panel for the book's time points. */
export function TimePointPanel({ book }: { book: Book }) {
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [usages, setUsages] = useState<TimePointUsage[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const [dragId, setDragId] = useState<Id | null>(null);
  const points = [...book.timePoints].sort((a, b) => a.position - b.position);

  const clear = () => {
    setIssues([]);
    setUsages([]);
  };
  /** Routes a failed mutation to the matching message list. */
  const onError = (e: ApiError) => {
    const body = e.body as { issues?: ValidationIssue[]; usages?: TimePointUsage[] } | undefined;
    if (e.status === 422 && body?.issues) setIssues(body.issues);
    if (e.status === 409 && body?.usages) setUsages(body.usages);
    setResetKey((k) => k + 1);
  };

  const create = useBookMutation<{ afterId: Id | null }>(book.id, 'POST', () => `/api/books/${book.id}/timepoints`, (v) => ({
    name: 'Neuer Zeitpunkt',
    afterId: v.afterId,
  }));
  const rename = useBookMutation<{ id: Id; name: string }>(
    book.id, 'PATCH', (v) => `/api/books/${book.id}/timepoints/${v.id}`, (v) => ({ name: v.name }),
  );
  const reorder = useBookMutation<{ ids: Id[] }>(book.id, 'PUT', () => `/api/books/${book.id}/timepoints/order`, (v) => ({ ids: v.ids }));
  const remove = useBookMutation<{ id: Id }>(book.id, 'DELETE', (v) => `/api/books/${book.id}/timepoints/${v.id}`);

  /** Validates the new order locally and only calls the API when it is valid. */
  const move = (id: Id, to: number) => {
    clear();
    const ids = points.map((p) => p.id);
    const from = ids.indexOf(id);
    if (to < 0 || to >= ids.length || from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    const draft: Book = { ...book, timePoints: ids.map((tid, position) => ({ ...points.find((p) => p.id === tid)!, position })) };
    const found = validateBook(draft);
    if (found.length > 0) {
      setIssues(found);
      return;
    }
    reorder.mutate({ ids }, { onError });
  };

  const tryDelete = (id: Id) => {
    clear();
    const used = timePointUsages(book, id);
    if (used.length > 0) {
      setUsages(used);
      return;
    }
    remove.mutate({ id }, { onError });
  };

  return (
    <section aria-label="Zeitpunkte">
      <button type="button" onClick={() => { clear(); create.mutate({ afterId: null }, { onError }); }}>
        + Zeitpunkt
      </button>
      <IssueList issues={issues} />
      {usages.length > 0 && <UsageList usages={usages} />}
      <ol className="panel-list">
        {points.map((p, i) => (
          <li
            key={p.id}
            draggable
            onDragStart={() => setDragId(p.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId && dragId !== p.id) move(dragId, i);
              setDragId(null);
            }}
          >
            <input
              aria-label={`Name Zeitpunkt ${p.name}`}
              defaultValue={p.name}
              key={`${p.name}-${resetKey}`}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name === '') e.target.value = p.name;
                else if (name !== p.name) rename.mutate({ id: p.id, name }, { onError });
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <button type="button" aria-label={`Zeitpunkt „${p.name}“ nach oben`} disabled={i === 0} onClick={() => move(p.id, i - 1)}>↑</button>
            <button type="button" aria-label={`Zeitpunkt „${p.name}“ nach unten`} disabled={i === points.length - 1} onClick={() => move(p.id, i + 1)}>↓</button>
            <button type="button" aria-label={`Zeitpunkt „${p.name}“ danach einfügen`} onClick={() => { clear(); create.mutate({ afterId: p.id }, { onError }); }}>danach einfügen</button>
            <button type="button" aria-label={`Zeitpunkt „${p.name}“ löschen`} onClick={() => tryDelete(p.id)}>Löschen</button>
          </li>
        ))}
      </ol>
    </section>
  );
}
