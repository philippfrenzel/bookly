/**
 * Scoped AI context for one text block of a scene assignment (spec 2026-11-21-szenen-schreiben-design.md §5
 * "Kontext Zauberstab") and the text request built from it: the model sees the scene, the assignment's place and
 * figures and the surrounding blocks, but may only write the targeted block.
 */
import { and, asc, eq } from 'drizzle-orm';
import { joinBlocks, UUID_RE } from '@bookly/shared';
import type { AiTextBody, Book, Id, WordRange } from '@bookly/shared';
import { assertAssignmentInBook } from '../books/sceneBlocks.js';
import type { Db } from '../db/client.js';
import { loadBook } from '../db/loadBook.js';
import { sceneAssignmentBlocks, sceneAssignments, sceneNotes, scenes } from '../db/schema.js';
import { NotFoundError } from '../errors.js';
import type { AiRequest } from './client.js';
import { lengthGuidance } from './lengthGuidance.js';
import type { TextContext } from './textContext.js';
import { textRequest } from './textPrompt.js';

/** Character budgets of the context parts. */
const NOTES_MAX = 4000;
const BEFORE_MAX = 3000;
const AFTER_MAX = 1500;

/** Length fallback of the block prompt when neither a book range nor an explicit choice applies. */
const BLOCK_LENGTH_FALLBACK = 'ein bis drei Absätze';

/** Makes the block's length line win over the general "1–3 Sätze" of the text prompt. */
const LENGTH_OVERRIDE = 'Abweichend von den Längenangaben oben („1–3 Sätze“) gilt für diesen Block: Umfang:';

const BLOCK_RULE =
  'Der Text ist ein Block eines Szenentextes (Prosa). Bearbeite nur diesen Block; textDavor und textDanach sind Umgebung und werden nie wiederholt oder verändert.';

/** Context of one scene block; generating is always allowed, also for an empty block. */
export interface SceneBlockContext extends TextContext {
  fieldLabel: 'Szenentext';
  hasText: true;
  /** The book's target word range, for the length line of the system prompt. */
  targetWords: WordRange | null;
  /** All characters of the book, to add those the text names (see mentions.ts). */
  characters: Book['characters'];
}

/** Name and description of the given characters of `book`, in the order of `ids`. */
function figures(book: Book, ids: Id[]): { name: string; beschreibung: string }[] {
  return ids.flatMap((id) => {
    const c = book.characters.find((x) => x.id === id);
    return c ? [{ name: c.name ?? '', beschreibung: c.description ?? '' }] : [];
  });
}

/**
 * Loads the context for block `blockId` of assignment `assignmentId`. Throws NotFoundError unless the block belongs
 * to the assignment, the assignment to a scene and the scene to `bookId`. Length text is added by sceneBlockRequest.
 */
export async function loadSceneBlockContext(
  db: Db,
  bookId: Id,
  assignmentId: Id,
  blockId: Id,
): Promise<SceneBlockContext> {
  await assertAssignmentInBook(db, assignmentId, bookId);
  if (!UUID_RE.test(blockId)) throw new NotFoundError();
  const [assignment] = await db.select().from(sceneAssignments).where(eq(sceneAssignments.id, assignmentId));
  if (!assignment) throw new NotFoundError();
  const [blockRows, [scene], notes, book] = await Promise.all([
    db
      .select({ id: sceneAssignmentBlocks.id, text: sceneAssignmentBlocks.text })
      .from(sceneAssignmentBlocks)
      .where(eq(sceneAssignmentBlocks.assignmentId, assignmentId))
      .orderBy(asc(sceneAssignmentBlocks.position)),
    db.select({ name: scenes.name }).from(scenes).where(and(eq(scenes.id, assignment.sceneId), eq(scenes.bookId, bookId))),
    db.select({ text: sceneNotes.text }).from(sceneNotes).where(eq(sceneNotes.sceneId, assignment.sceneId)).orderBy(asc(sceneNotes.position), asc(sceneNotes.createdAt)),
    loadBook(db, bookId),
  ]);
  const index = blockRows.findIndex((b) => b.id === blockId);
  if (index < 0 || !scene) throw new NotFoundError();

  const section = assignment.sectionId ? book.storylines.flatMap((l) => l.sections).find((s) => s.id === assignment.sectionId) : undefined;
  const line = book.storylines.find((l) => l.id === (section?.storylineId ?? assignment.storylineId));
  if (!line || (assignment.sectionId && !section)) throw new NotFoundError();
  const ort = section
    ? { art: 'Abschnitt', titel: section.title, beschreibung: section.description, storyline: line.title }
    : { art: 'Storyline', titel: line.title, beschreibung: line.description, storyline: line.title };

  const targetWords = book.targetWords ?? null;
  return {
    fieldLabel: 'Szenentext',
    hasText: true,
    targetWords,
    characters: book.characters,
    context: {
      buch: book.title,
      szene: {
        name: scene.name,
        notizen: notes.map((n) => n.text.trim()).filter((t) => t !== '').join('\n\n').slice(0, NOTES_MAX),
      },
      ort,
      figuren: figures(book, section ? section.characterIds : line.characterIds),
      textDavor: joinBlocks(blockRows.slice(0, index).map((b) => b.text)).slice(-BEFORE_MAX),
      textDanach: joinBlocks(blockRows.slice(index + 1).map((b) => b.text)).slice(0, AFTER_MAX),
    },
  };
}

/**
 * The text request for a scene block: the general text request plus the block rule. When writing new text
 * (generate, continue) the length guidance, derived once from `body.length`, goes both into `kontext.zielumfang`
 * and into a system line that explicitly overrides the general "1–3 Sätze"; rephrase and polish keep the length
 * of the target passage and get neither.
 */
export function sceneBlockRequest(ctx: SceneBlockContext, body: AiTextBody): AiRequest {
  const writesNew = body.action === 'generate' || body.action === 'continue';
  const guidance = writesNew ? lengthGuidance(ctx.targetWords, body.length, BLOCK_LENGTH_FALLBACK) : null;
  const req = textRequest(guidance === null ? ctx : { ...ctx, context: { ...ctx.context, zielumfang: guidance } }, body);
  const lines = [BLOCK_RULE, ...(guidance === null ? [] : [`${LENGTH_OVERRIDE} ${guidance}`])];
  return { ...req, system: `${req.system}\n${lines.join('\n')}` };
}
