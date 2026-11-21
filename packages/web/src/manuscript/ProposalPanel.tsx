/**
 * AI structure tab (author only): asks for a chapter structure or for adjustments only on request (FR-001, FR-020),
 * shows the proposal with what changes and why, and lets the author accept or reject it (FR-003).
 */
import { useState } from 'react';
import type { Id, ManuscriptResponse, ProposalBlock, StructureProposal } from '@bookly/shared';
import { Icon } from '../ui/Icon';
import { manuscriptError, useManuscriptMutation } from './manuscriptApi';

/** The proposal tab. */
export function ProposalPanel({ bookId, ms }: { bookId: Id; ms: ManuscriptResponse }) {
  const mutate = useManuscriptMutation(bookId);
  const [wish, setWish] = useState('');
  const proposal = ms.proposals[0];
  const empty = ms.chapters.length === 0;
  const blocker = !ms.ai.enabled ? 'KI nicht eingerichtet.' : null;
  const ask = () => mutate.mutate({ method: 'POST', path: '/proposals', body: wish.trim() ? { wish: wish.trim() } : {} });

  return (
    <div className="ms-panel">
      <p className="muted">
        {empty
          ? 'Die KI schlägt aus deinen Storylines, Figuren und Szenen eine Kapitelstruktur vor. Du entscheidest, ob du sie übernimmst.'
          : 'Die KI schlägt Kapitelgrenzen und Szenenübergänge für deine Struktur vor. Nichts ändert sich, bevor du zustimmst.'}
      </p>
      <label>
        Wunsch an die KI (optional)
        <input value={wish} maxLength={1000} onChange={(e) => setWish(e.target.value)} placeholder="z. B. kürzere Kapitel, Nebenstrang früher einweben" />
      </label>
      <button type="button" className="primary with-icon" disabled={blocker !== null || mutate.isPending} title={blocker ?? undefined} onClick={ask}>
        <Icon name="wand" />{mutate.isPending ? 'Denke nach …' : empty ? 'Struktur vorschlagen' : 'Anpassung vorschlagen'}
      </button>
      {blocker && <p className="muted">{blocker}</p>}
      {mutate.isError && <p className="error" role="alert">{manuscriptError(mutate.error)}</p>}
      {proposal && <ProposalView ms={ms} proposal={proposal} onDecide={(d) => mutate.mutate({ method: 'POST', path: `/proposals/${proposal.id}/${d}` })} busy={mutate.isPending} />}
    </div>
  );
}

/** Where each existing block currently sits: chapter id and index. */
function currentPlaces(ms: ManuscriptResponse): Map<Id, { chapterId: Id; index: number; title: string }> {
  const map = new Map<Id, { chapterId: Id; index: number; title: string }>();
  for (const c of ms.chapters) c.blocks.forEach((b, index) => map.set(b.id, { chapterId: c.id, index, title: b.title }));
  return map;
}

/** One open proposal with change marks. */
function ProposalView({ ms, proposal, onDecide, busy }: { ms: ManuscriptResponse; proposal: StructureProposal; onDecide: (d: 'accept' | 'reject') => void; busy: boolean }) {
  const places = currentPlaces(ms);
  const chapterTitle = new Map(ms.chapters.map((c) => [c.id, c.title]));
  const mark = (b: ProposalBlock, chapterId: Id | null, index: number): string | null => {
    if (!b.blockId) return 'neu';
    const at = places.get(b.blockId);
    if (!at) return null;
    if (at.chapterId !== chapterId) return `aus „${chapterTitle.get(at.chapterId)}“`;
    return at.index !== index ? 'neue Position' : null;
  };
  return (
    <article className="ms-proposal" aria-label="KI-Vorschlag">
      <h3>{proposal.kind === 'initial' ? 'Vorgeschlagene Struktur' : 'Vorgeschlagene Anpassung'}</h3>
      {proposal.summary && <p>{proposal.summary}</p>}
      <ol className="ms-proposal-chapters">
        {proposal.chapters.map((c, ci) => (
          <li key={ci}>
            <strong>{c.title}</strong>
            {!c.chapterId && <span className="tab-count">neu</span>}
            {c.reason && <p className="muted ms-reason">{c.reason}</p>}
            <ul>
              {c.blocks.map((b, bi) => {
                const m = mark(b, c.chapterId, bi);
                const title = b.blockId ? places.get(b.blockId)?.title ?? b.title : b.title;
                return (
                  <li key={bi}>
                    {title}
                    {m && <span className={`ms-change${m === 'neu' ? ' is-new' : ''}`}>{m}</span>}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
      <p className="muted">Bausteine, die hier fehlen, bleiben, wo sie sind. Texte und Versionen ändern sich nicht.</p>
      <div className="actions">
        <button type="button" className="primary" disabled={busy} onClick={() => onDecide('accept')}>Übernehmen</button>
        <button type="button" disabled={busy} onClick={() => onDecide('reject')}>Verwerfen</button>
      </div>
    </article>
  );
}
