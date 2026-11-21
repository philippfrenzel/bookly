/** Version list of a block (FR-004): every saved version, newest first; an older one can be brought back as the newest. */
import { useState } from 'react';
import type { BlockVersion, Id, ManuscriptBlock } from '@bookly/shared';
import { manuscriptError, useBlockVersions, useManuscriptMutation } from './manuscriptApi';

const REASON: Record<BlockVersion['reason'], string> = { create: 'angelegt', edit: 'bearbeitet', restore: 'wiederhergestellt', suggestion: 'Vorschlag übernommen' };

/** Lists the versions of `block`. */
export function BlockVersions({ bookId, block, canRestore }: { bookId: Id; block: ManuscriptBlock; canRestore: boolean }) {
  const versions = useBlockVersions(bookId, block.id, true, block.version);
  const mutate = useManuscriptMutation(bookId);
  const [open, setOpen] = useState<number | null>(null);
  if (versions.isPending) return <p className="muted">Versionen laden …</p>;
  if (versions.isError) return <p className="error">Versionen konnten nicht geladen werden.</p>;
  return (
    <div className="ms-versions">
      <ol className="ms-version-list" aria-label="Versionen">
        {versions.data.map((v) => (
          <li key={v.version}>
            <button type="button" className="link-button" aria-expanded={open === v.version} onClick={() => setOpen(open === v.version ? null : v.version)}>
              Version {v.version}
            </button>
            <span className="muted"> · {REASON[v.reason]} von {v.authorName} · {new Date(v.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span>
            {v.version === block.version && <span className="tab-count">aktuell</span>}
            {open === v.version && (
              <div className="ms-version-body">
                <strong>{v.title}</strong>
                {v.synopsis && <p className="muted">{v.synopsis}</p>}
                <div className="ms-text">{v.text || '(leer)'}</div>
                {canRestore && v.version !== block.version && (
                  <button type="button" disabled={mutate.isPending} onClick={() => mutate.mutate({ method: 'POST', path: `/blocks/${block.id}/versions/${v.version}/restore` })}>
                    Diese Version wiederherstellen
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      {mutate.isError && <p className="error" role="alert">{manuscriptError(mutate.error)}</p>}
    </div>
  );
}
