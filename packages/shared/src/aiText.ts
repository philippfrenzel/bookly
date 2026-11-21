/** Request/response schemas and pure text-insertion helpers for the AI "magic wand" on text fields. */
import { z } from 'zod';
import { LengthChoiceSchema } from './length.js';
import { MANUSCRIPT_LIMITS } from './manuscript.js';

const Id = z.string().uuid();
const ConnType = z.enum(['character_switch', 'time_jump', 'merge', 'flashback']);

/** Minimum number of non-space characters in a selection. */
export const MIN_SELECTION = 3;
/** Minimum free characters required to offer "continue". */
export const MIN_CONTINUE_ROOM = 20;

/** Maximum length of a free instruction to the AI ("instruct"). */
export const MAX_INSTRUCTION = 300;

/** What the wand should do with the field text; "instruct" follows the author's own instruction. */
export type AiTextAction = 'rephrase' | 'continue' | 'polish' | 'generate' | 'instruct';
const AiTextActionSchema = z.enum(['rephrase', 'continue', 'polish', 'generate', 'instruct']);

/** Identifies the text field the wand works on. */
export const AiTextTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('storyline'), storylineId: Id.nullable(), field: z.enum(['title', 'description', 'note']) }),
  z.object({ kind: z.literal('section'), storylineId: Id, sectionId: Id.nullable(), field: z.enum(['title', 'description', 'note']) }),
  z.object({ kind: z.literal('character'), characterId: Id, field: z.enum(['name', 'description', 'behavior', 'intentions']) }),
  z.object({ kind: z.literal('addition'), storylineId: Id, characterId: Id, field: z.enum(['behavior', 'intentions']) }),
  z.object({ kind: z.literal('sceneBlock'), assignmentId: Id, blockId: Id, field: z.literal('text') }),
  z.object({ kind: z.literal('manuscriptBlock'), blockId: Id, field: z.enum(['text', 'synopsis']) }),
  z.object({ kind: z.literal('connection'), fromId: Id, toId: Id, type: ConnType, characterId: Id.nullable(), field: z.literal('label') }),
]);
export type AiTextTarget = z.infer<typeof AiTextTarget>;

const draftText = z.string().max(10000);
/** Unsaved sibling field values of the owning object, used as context. */
export const AiTextDraft = z.object({
  title: draftText.optional(),
  description: draftText.optional(),
  note: draftText.optional(),
  name: draftText.optional(),
  behavior: draftText.optional(),
  intentions: draftText.optional(),
  characterIds: z.array(Id).optional(),
});
export type AiTextDraft = z.infer<typeof AiTextDraft>;

/** Maximum length and line mode of the targeted field. */
export function fieldLimit(target: AiTextTarget): { max: number; singleLine: boolean } {
  switch (target.kind) {
    case 'storyline':
    case 'section':
      return target.field === 'title'
        ? { max: 200, singleLine: true }
        : { max: target.field === 'note' ? 10000 : 2000, singleLine: false };
    case 'character':
      return target.field === 'name' ? { max: 200, singleLine: true } : { max: 2000, singleLine: false };
    case 'addition':
      return { max: 2000, singleLine: false };
    case 'sceneBlock':
      return { max: 10000, singleLine: false };
    case 'manuscriptBlock':
      return { max: MANUSCRIPT_LIMITS[target.field], singleLine: false };
    case 'connection':
      return { max: 200, singleLine: true };
  }
}

/** Request body of the AI text route. */
export const AiTextBody = z
  .object({
    target: AiTextTarget,
    action: AiTextActionSchema,
    /** Longest field text (a manuscript block); fieldLimit narrows it per target. */
    text: z.string().max(MANUSCRIPT_LIMITS.text),
    selection: z.object({ start: z.number().int(), end: z.number().int() }).nullable(),
    draft: AiTextDraft.default({}),
    /** Wanted length of a generated scene block. */
    length: LengthChoiceSchema.optional(),
    /** The author's own instruction; required for "instruct", not allowed otherwise. */
    instruction: z.string().max(MAX_INSTRUCTION).optional(),
  })
  .superRefine((b, ctx) => {
    const fail = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (b.text.length > fieldLimit(b.target).max) fail('text', 'text too long');
    if (b.selection) {
      const { start, end } = b.selection;
      if (!(start >= 0 && start < end && end <= b.text.length)) fail('selection', 'invalid selection');
      else if (b.text.slice(start, end).trim().length < MIN_SELECTION) fail('selection', 'selection too short');
    }
    if (b.action === 'instruct' ? !b.instruction?.trim() : b.instruction !== undefined) {
      fail('instruction', b.action === 'instruct' ? 'instruction required' : 'instruction only with instruct');
    }
    if (b.action === 'generate') {
      if (b.text.trim() !== '' || b.selection !== null) fail('action', 'generate needs an empty field');
    } else if (b.text.trim() === '') fail('text', 'text required');
  });
export type AiTextBody = z.infer<typeof AiTextBody>;

/** Response of the AI text route. */
export const AiTextResult = z.object({ suggestions: z.array(z.string()) });
export type AiTextResult = z.infer<typeof AiTextResult>;

/** The text range a suggestion replaces (empty range = pure insertion). */
export function targetRange(
  action: AiTextAction,
  text: string,
  selection: { start: number; end: number } | null,
): { start: number; end: number } {
  if (action === 'generate') return { start: 0, end: 0 };
  if (action === 'continue') {
    const at = selection ? selection.end : text.length;
    return { start: at, end: at };
  }
  return selection ? { start: selection.start, end: selection.end } : { start: 0, end: text.length };
}

/** Normalizes a raw suggestion so it fits the field when spliced into `range` of `text`. */
export function fitSuggestion(
  suggestion: string,
  text: string,
  range: { start: number; end: number },
  limit: { max: number; singleLine: boolean },
  action: AiTextAction,
): string {
  let s = suggestion.trim();
  if (limit.singleLine) s = s.replace(/\s*\n\s*/g, ' ');
  if (action === 'continue' && range.start > 0 && !/\s/.test(text[range.start - 1] ?? '') && !/^[\s.,;:!?)]/.test(s)) {
    s = ' ' + s;
  }
  const room = limit.max - (text.length - (range.end - range.start));
  return s.slice(0, Math.max(0, room)).trimEnd();
}

/** True when the owning object has text besides the target field (context for "generate"). */
export function draftHasText(target: AiTextTarget, draft: AiTextDraft): boolean {
  const has = (v: string | undefined) => (v ?? '').trim() !== '';
  if (target.kind === 'storyline') {
    const others = (['title', 'description', 'note'] as const).filter((f) => f !== target.field);
    return others.some((f) => has(draft[f])) || (draft.characterIds?.length ?? 0) > 0;
  }
  if (target.kind === 'character') {
    return (['name', 'description', 'behavior', 'intentions'] as const).filter((f) => f !== target.field).some((f) => has(draft[f]));
  }
  if (target.kind === 'manuscriptBlock') {
    // Block title (draft.title) and, for the text, the plan (draft.description).
    return has(draft.title) || (target.field === 'text' && has(draft.description));
  }
  return true;
}
