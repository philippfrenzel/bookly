/**
 * The text of one scene assignment as ordered blocks, each with its own magic wand: split at the caret,
 * insert an empty block, undo a split, remove an empty block. Text is saved when a block is left;
 * structural changes are saved at once (spec 2026-11-21-szenen-schreiben-design.md, A2/A3).
 */
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, SyntheticEvent } from 'react';
import { SCENE_BLOCK_LIMITS, splitBlockText } from '@bookly/shared';
import type { Id, LengthChoice, SceneAssignment, SceneBlock } from '@bookly/shared';
import { LengthSelect } from '../ai/LengthSelect';
import { MagicWand } from '../ai/MagicWand';
import { insertAfter, removeEmpty, splitAt, undoSplit } from './blockOps';
import type { DraftBlock, SplitRecord } from './blockOps';
import { useBlockSaver, type AfterSave, type BuildBlocks } from './useBlockSaver';

/** Props of {@link SceneBlocks}. */
export interface SceneBlocksProps {
  bookId: Id;
  assignment: SceneAssignment;
  /** BookResponse.ai.enabled */
  aiEnabled: boolean;
  /** Scene name used in the accessible names of the blocks. */
  name: string;
}

/** The block that last had focus and its caret or selection. */
interface Active {
  id: Id;
  start: number;
  end: number;
}

/** Keeps the active block's focus and caret when a toolbar button is pressed with the mouse. */
const keepFocus = (e: ReactMouseEvent) => e.preventDefault();

/** Index of block `id`, or null when it is not in the list. */
const indexOf = (blocks: DraftBlock[], id: Id | undefined): number | null => {
  const i = blocks.findIndex((b) => b.id === id);
  return i < 0 ? null : i;
};

/** Ordered text blocks of one assignment with a toolbar (Länge, teilen, einfügen, rückgängig, entfernen) and a wand per block. */
export function SceneBlocks({ bookId, assignment, aiEnabled, name }: SceneBlocksProps) {
  const saver = useBlockSaver(bookId, assignment);
  const { blocks, run } = saver;
  const [active, setActive] = useState<Active | null>(null);
  const [split, setSplit] = useState<SplitRecord | null>(null);
  const [length, setLength] = useState<LengthChoice>('book');
  const [focusId, setFocusId] = useState<Id | null>(null);
  const [structureSaving, setStructureSaving] = useState(false);
  const structureLocked = useRef(false);
  const fields = useRef(new Map<Id, HTMLTextAreaElement>());

  // A block inserted by "Block einfügen" gets the focus once it is rendered from the response.
  useEffect(() => {
    const el = focusId ? fields.current.get(focusId) : undefined;
    if (!el) return;
    el.focus();
    setFocusId(null);
  }, [focusId, blocks]);

  const runStructure = async (build: BuildBlocks, after: AfterSave) => {
    if (structureLocked.current) return;
    structureLocked.current = true;
    setStructureSaving(true);
    try {
      await run(build, after);
    } finally {
      structureLocked.current = false;
      setStructureSaving(false);
    }
  };

  const activeBlock = active ? blocks.find((b) => b.id === active.id) : undefined;
  const full = blocks.length >= SCENE_BLOCK_LIMITS.count;
  const canSplit = !full && !!active && !!activeBlock && active.start === active.end && splitBlockText(activeBlock.text, active.start) !== null;
  const canUndo = split !== null && undoSplit(blocks, split) !== null;
  const canRemove = !!activeBlock && activeBlock.text === '' && blocks.length > 1;

  const track = (id: Id) => (e: SyntheticEvent<HTMLTextAreaElement>) =>
    setActive({ id, start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd });

  const onSplit = () => {
    if (!active) return;
    const el = fields.current.get(active.id);
    const caret = el ? el.selectionStart : active.start;
    const id = active.id;
    void runStructure(
      (list) => {
        const i = indexOf(list, id);
        return i === null ? null : splitAt(list, i, caret);
      },
      (sent, saved) => {
        const i = indexOf(sent, id);
        const second = i === null ? undefined : saved[i + 1];
        if (i === null || !second) return;
        const first = sent[i]!.text;
        setSplit({ firstId: id, secondId: second.id, first, second: sent[i + 1]!.text });
        setActive({ id, start: first.length, end: first.length });
      },
    );
  };

  const onInsert = () => {
    const id = active?.id;
    void runStructure(
      (list) => insertAfter(list, indexOf(list, id)),
      (sent, saved) => {
        const fresh = saved[sent.findIndex((b) => b.id === undefined)];
        if (!fresh) return;
        setActive({ id: fresh.id, start: 0, end: 0 });
        setFocusId(fresh.id);
      },
    );
  };

  const onUndo = () => {
    if (!split) return;
    const record = split;
    void runStructure(
      (list) => undoSplit(list, record),
      () => {
        setSplit(null);
        setActive(null);
      },
    );
  };

  const onRemove = () => {
    const id = active?.id;
    void runStructure(
      (list) => {
        const i = indexOf(list, id);
        return i === null ? null : removeEmpty(list, i);
      },
      () => setActive(null),
    );
  };

  /** Saves the blocks when the one being left differs from its stored text. */
  const onBlur = (block: SceneBlock) => {
    if (structureLocked.current) return;
    const storedText = assignment.blocks.find((b) => b.id === block.id)?.text;
    if (block.text !== storedText) void run((list, changed) => (changed ? list : null));
  };

  return (
    <div className="scene-blocks">
      <div className="actions" role="toolbar" aria-label={`Blöcke Szene ${name}`} aria-busy={structureSaving}>
        <LengthSelect value={length} onChange={setLength} />
        <button type="button" disabled={structureSaving || !canSplit} onMouseDown={keepFocus} onClick={onSplit}>Hier teilen</button>
        <button type="button" disabled={structureSaving || full} onMouseDown={keepFocus} onClick={onInsert}>Block einfügen</button>
        {canUndo && <button type="button" disabled={structureSaving} onMouseDown={keepFocus} onClick={onUndo}>Teilung rückgängig</button>}
        {canRemove && <button type="button" disabled={structureSaving} onMouseDown={keepFocus} onClick={onRemove}>Leeren Block entfernen</button>}
      </div>
      {blocks.map((b, i) => {
        const label = `Block ${i + 1} Szene ${name}`;
        return (
          <div className="wand-field" key={b.id}>
            <textarea
              ref={(el) => {
                if (el) fields.current.set(b.id, el);
                else fields.current.delete(b.id);
              }}
              aria-label={label}
              maxLength={SCENE_BLOCK_LIMITS.text}
              placeholder="Text dieses Blocks"
              value={b.text}
              readOnly={structureSaving}
              onChange={(e) => {
                if (!structureLocked.current) saver.edit(b.id, e.target.value);
              }}
              onBlur={() => onBlur(b)}
              onFocus={track(b.id)}
              onSelect={track(b.id)}
              onKeyUp={track(b.id)}
              onClick={track(b.id)}
            />
            <MagicWand
              getField={() => structureLocked.current ? null : fields.current.get(b.id) ?? null}
              bookId={bookId}
              target={{ kind: 'sceneBlock', assignmentId: assignment.id, blockId: b.id, field: 'text' }}
              enabled={aiEnabled && !structureSaving}
              fieldLabel={label}
              length={length}
            />
          </div>
        );
      })}
      {saver.feedback}
    </div>
  );
}
