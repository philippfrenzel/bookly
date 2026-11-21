/**
 * Saving the blocks of one scene assignment: local unsaved texts per block and a queue of block PUTs.
 * Every PUT sends the full ordered list built from the stored blocks plus the local texts. Its revision is
 * the base the local texts were typed on while any are pending (so a refetch that brought another tab's
 * save into the cache makes the PUT stale instead of silently overwriting it), else the cached one; an own
 * successful save moves the base to the revision it produced, so queued saves never race each other into
 * a 409. After a stale save, operations still queued are dropped (spec 2026-11-21-szenen-schreiben, §3/§6).
 */
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BookResponse, Id, SceneAssignment, SceneBlock } from '@bookly/shared';
import { useBookMutation } from '../api/hooks';
import { useSaveFeedback } from '../book/saveFeedback';
import type { DraftBlock } from './blockOps';
import { useStaleNotice } from './staleNotice';

/** Builds the list to PUT from the current blocks (local texts applied); null sends nothing. `changed`: some local text differs from the stored one. */
export type BuildBlocks = (blocks: DraftBlock[], changed: boolean) => DraftBlock[] | null;
/** Called after a successful PUT with the list sent and the blocks stored now (new blocks have their ids). */
export type AfterSave = (sent: DraftBlock[], saved: SceneBlock[]) => void;

/** Result of {@link useBlockSaver}. */
export interface BlockSaver {
  /** Stored blocks with the local texts applied, in order. */
  blocks: SceneBlock[];
  /** Records a local text of a block (not saved yet). */
  edit: (id: Id, text: string) => void;
  /** Queues a PUT built by `build` when its turn comes. */
  run: (build: BuildBlocks, after?: AfterSave) => void;
  /** Error and stale messages to render. */
  feedback: JSX.Element;
}

/** Local texts and the PUT queue of one assignment's blocks. */
export function useBlockSaver(bookId: Id, assignment: SceneAssignment): BlockSaver {
  const qc = useQueryClient();
  const fb = useSaveFeedback();
  const stale = useStaleNotice(bookId);
  const put = useBookMutation<{ revision: number; blocks: DraftBlock[] }>(
    bookId,
    'PUT',
    () => `/api/books/${bookId}/scene-assignments/${assignment.id}/blocks`,
    (v) => v,
  );
  const [edits, setEditsState] = useState<Record<Id, string>>({});
  const editsRef = useRef(edits);
  const setEdits = (next: Record<Id, string>) => {
    editsRef.current = next;
    if (Object.keys(next).length === 0) base.current = null;
    setEditsState(next);
  };
  const queue = useRef<Promise<void>>(Promise.resolve());
  /** Revision the pending local texts are based on; null while there are none. */
  const base = useRef<number | null>(null);
  /** Bumped by a stale save; queued operations from before it are dropped. */
  const generation = useRef(0);

  /** The assignment as stored right now (the cache may be newer than this render's props). */
  const stored = (): SceneAssignment | undefined =>
    qc.getQueryData<BookResponse>(['book', bookId])?.sceneAssignments.find((a) => a.id === assignment.id);

  const send = async (build: BuildBlocks, after: AfterSave | undefined, queuedIn: number) => {
    if (queuedIn !== generation.current) return;
    const now = stored();
    if (!now) return;
    const local = editsRef.current;
    const current = now.blocks.map((b) => ({ id: b.id, text: local[b.id] ?? b.text }));
    const blocks = build(current, now.blocks.some((b) => local[b.id] !== undefined && local[b.id] !== b.text));
    if (!blocks) return;
    fb.clear();
    stale.clear();
    try {
      const pending = Object.keys(local).length > 0;
      const res = await put.mutateAsync({ revision: pending && base.current !== null ? base.current : now.revision, blocks });
      const saved = res.sceneAssignments.find((a) => a.id === assignment.id);
      // Local texts that went into this list are stored now; texts typed during the request stay, based on the saved revision.
      const left = { ...editsRef.current };
      for (const id of Object.keys(local)) if (left[id] === local[id]) delete left[id];
      setEdits(left);
      if (Object.keys(left).length > 0 && saved) base.current = saved.revision;
      after?.(blocks, saved?.blocks ?? []);
    } catch (e) {
      // Stale: the reloaded stored state replaces every local text (the message says so); queued operations are dropped.
      if (stale.handle(e)) {
        generation.current += 1;
        setEdits({});
      } else fb.onError(e);
    }
  };

  return {
    blocks: assignment.blocks.map((b) => ({ id: b.id, text: edits[b.id] ?? b.text })),
    edit: (id, text) => {
      // The first pending edit fixes the revision it is based on.
      if (Object.keys(editsRef.current).length === 0) base.current = stored()?.revision ?? assignment.revision;
      setEdits({ ...editsRef.current, [id]: text });
    },
    run: (build, after) => {
      const queuedIn = generation.current;
      queue.current = queue.current.then(() => send(build, after, queuedIn));
    },
    feedback: (
      <>
        {stale.notice}
        {fb.feedback}
      </>
    ),
  };
}
