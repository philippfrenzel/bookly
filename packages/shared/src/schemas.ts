/** Zod request-body schemas shared by the server (parsing) and the web client (types). */
import { z } from 'zod';
import { CHARACTER_CRITERIA, type CharacterCriterion } from './criteria.js';
import { WordRangeSchema } from './length.js';

/** Matches a canonical uuid string. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Id = z.string().uuid();
const title = z.string().trim().min(1).max(200);
const description = z.string().trim().max(2000);
const note = z.string().trim().max(10000);
const Range = z.object({ startId: Id, endId: Id });
const Kind = z.enum(['main', 'side']);
const Status = z.enum(['in_progress', 'completed', 'open']);
const ConnType = z.enum(['character_switch', 'time_jump', 'merge', 'flashback']);
const Rule = z.enum([
  'time_jump_order',
  'merge_no_contact',
  'flashback_order',
  'switch_character_missing',
  'switch_character_not_in_both',
  'character_overlap',
]);
const CharacterCriterionSchema = z.enum(CHARACTER_CRITERIA.map((c) => c.key) as [CharacterCriterion, ...CharacterCriterion[]]);
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const RegisterBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(1024),
  displayName: z.string().trim().min(1).max(200),
});
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(1024),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const BookBody = z.object({ title });
export type BookBody = z.infer<typeof BookBody>;

/** Change a book's title, its target word range (null clears it), or both. */
export const BookPatchBody = z
  .object({ title: title.optional(), targetWords: WordRangeSchema.nullable().optional() })
  .refine((b) => b.title !== undefined || b.targetWords !== undefined, { message: 'nothing to change' });
export type BookPatchBody = z.infer<typeof BookPatchBody>;

export const TimePointCreateBody = z.object({ name: title, afterId: Id.nullable() });
export type TimePointCreateBody = z.infer<typeof TimePointCreateBody>;

export const TimePointPatchBody = z.object({ name: title });
export type TimePointPatchBody = z.infer<typeof TimePointPatchBody>;

export const ReorderBody = z.object({ ids: z.array(Id) });
export type ReorderBody = z.infer<typeof ReorderBody>;

/** Optional free-text field: trimmed, blank becomes null. */
const profileText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullish();

export const CharacterBody = z.object({
  name: profileText(200),
  description: profileText(2000),
  behavior: profileText(2000),
  intentions: profileText(2000),
});
export type CharacterBody = z.infer<typeof CharacterBody>;

export const StorylineCreateBody = z.object({
  title,
  description: description.default(''),
  characterIds: z.array(Id).default([]),
  range: Range,
  kind: Kind,
  status: Status.default('in_progress'),
  color: color.optional(),
  note: note.nullable().default(null),
});
export type StorylineCreateBody = z.infer<typeof StorylineCreateBody>;

export const StorylinePatchBody = StorylineCreateBody.partial();
export type StorylinePatchBody = z.infer<typeof StorylinePatchBody>;

export const SectionCreateBody = z.object({
  title,
  description: description.default(''),
  characterIds: z.array(Id).default([]),
  range: Range,
  note: note.nullable().default(null),
});
export type SectionCreateBody = z.infer<typeof SectionCreateBody>;

export const SectionPatchBody = SectionCreateBody.partial();
export type SectionPatchBody = z.infer<typeof SectionPatchBody>;

export const ConnectionCreateBody = z.object({
  fromId: Id,
  toId: Id,
  type: ConnType,
  label: z.string().trim().max(200).nullable().default(null),
  characterId: Id.nullable().default(null),
});
export type ConnectionCreateBody = z.infer<typeof ConnectionCreateBody>;

export const ConnectionPatchBody = z.object({
  type: ConnType.optional(),
  label: z.string().trim().max(200).nullable().optional(),
  characterId: Id.nullable().optional(),
});
export type ConnectionPatchBody = z.infer<typeof ConnectionPatchBody>;

export const AcknowledgementBody = z.object({
  connectionId: Id,
  rule: Rule,
  characterId: Id.nullable(),
});
export type AcknowledgementBody = z.infer<typeof AcknowledgementBody>;

export const AdditionBody = z.object({ behavior: profileText(2000), intentions: profileText(2000) });
export type AdditionBody = z.infer<typeof AdditionBody>;

export const CharacterWarningAckBody = z.object({ storylineId: Id, characterId: Id, criterion: CharacterCriterionSchema });
export type CharacterWarningAckBody = z.infer<typeof CharacterWarningAckBody>;
