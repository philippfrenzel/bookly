# Szenen schreiben Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ordered text blocks per scene assignment (split, insert, undo split), a wand that rewrites/drafts exactly one block with server-derived context, and an optional book word range with a „knapp / passend zum Buch / ausführlich“ length choice at AI composing time.

**Architecture:** New table `scene_assignment_blocks` is the source of truth; `scene_assignments.description` stays as the derived joined text (`"\n\n"`) written in the same transaction, so all existing readers keep working. One atomic `PUT …/blocks` with an optimistic `revision` replaces the ordered list. The wand gets a new `AiTextTarget` kind `sceneBlock`; the server loads context itself. The book gets `target_words_min/max`.

**Tech Stack:** TypeScript, Fastify 5, Drizzle ORM 0.44 / PostgreSQL, Zod, React 18 + TanStack Query, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-szenen-schreiben-design.md` (read it; section 5 holds the decided values).

## Global Constraints

- UI copy German, code/docs English. Docstrings on new functions and file headers (repo-hygiene).
- Labels verbatim: „Hier teilen“, „Block einfügen“, „Teilung rückgängig“, „Leeren Block entfernen“, „Länge“, options „knapp“, „passend zum Buch“, „ausführlich“; panel tab „Umfang“; stale message „Die Szene wurde inzwischen geändert. Der aktuelle Stand ist geladen.“
- `LengthChoice = 'short' | 'book' | 'long'`, default `'book'`; always optional in request bodies.
- Block text: max 10 000 chars, not trimmed; 1–200 blocks per assignment. Join separator `"\n\n"`.
- Word range: integers, 1 ≤ min ≤ max ≤ 2 000 000; `null` clears.
- Without a word range and with `length` `'book'`/absent the block draft system prompt is byte-identical to today's `DRAFT_SYSTEM`.
- Never put the book range as a per-scene/per-block quota into a prompt.
- Do NOT edit the „Neu erzeugen“ / „Beschreibung erzeugen“ button label/icon hunks in `SceneAssignments.tsx` (a parallel branch changes them). Do not edit `textPrompt.ts` `BASE`/`ACTION_LINES` (parallel branch); add scene-block lines in a separate module.
- Tests: `TEST_DATABASE_URL=postgres://localhost:5432/bookly_test_spookly_scene`. E2E: `E2E_DATABASE_URL=postgres://localhost:5432/bookly_e2e_spookly_scene E2E_API_PORT=3130 E2E_WEB_PORT=5194`.

## Review Focus

1. Split at caret inside a multi-byte/umlaut or leading-space position → the two halves concatenate to exactly the original (Task 1 `splitBlockText` test with „ „Jon antwortete““).
2. Two tabs: tab B saves blocks after tab A changed them → 409 `stale`, nothing written, UI reloads and says so (Task 2 server test, Task 5 web test).
3. PUT with a block id from another assignment of the same scene → 400 `unknown_block`, stored blocks unchanged (Task 2).
4. Wand request with `blockId` not belonging to `assignmentId` / foreign book → 404, model never called (Task 3).
5. Old book row without range and old `{ title }` PATCH → unchanged behaviour; old assignments with empty description → one empty block, editable (Task 2 migration test).

---

### Task 1: Shared contracts

**Files:**
- Modify: `packages/shared/src/scenes.ts`, `packages/shared/src/aiText.ts`, `packages/shared/src/schemas.ts`, `packages/shared/src/domain.ts`, `packages/shared/src/manuscript.ts`
- Create: `packages/shared/src/length.ts` (+ export from `index.ts`)
- Test: `packages/shared/src/scenes.test.ts`, `packages/shared/src/aiText.test.ts`, `packages/shared/src/length.test.ts`

**Interfaces (Produces):**
- `length.ts`: `type LengthChoice = 'short'|'book'|'long'`; `LengthChoiceSchema = z.enum([...])`; `LENGTH_LABELS: Record<LengthChoice,string>` (knapp / passend zum Buch / ausführlich); `interface WordRange { min: number; max: number }`; `WordRangeSchema` (ints, refine min≤max, bounds above); `WORD_RANGE_MAX = 2_000_000`.
- `domain.ts`: `Book.targetWords?: WordRange | null`. `manuscript.ts`: `ManuscriptResponse.book` gains `targetWords: WordRange | null`.
- `schemas.ts`: `BookPatchBody = z.object({ title: title.optional(), targetWords: WordRangeSchema.nullable().optional() }).refine(at least one)`. `BookBody` unchanged.
- `scenes.ts`: `SCENE_BLOCK_LIMITS = { text: 10000, count: 200 }`; `BLOCK_SEPARATOR = '\n\n'`; `interface SceneBlock { id: Id; text: string }`; `SceneAssignment` gains `blocks: SceneBlock[]; revision: number`; `SceneBlocksBody = z.object({ revision: z.number().int().min(0), blocks: z.array(z.object({ id: Id.optional(), text: z.string().max(10000) })).min(1).max(200) })` + refine no duplicate ids; `SceneAssignmentPatchBody` gains `revision: z.number().int().min(0).optional()`; `joinBlocks(texts: string[]): string`; `splitBlockText(text: string, caret: number): [string, string] | null` (null unless `0 < caret < text.length`).
- `aiText.ts`: `AiTextTarget` adds `z.object({ kind: z.literal('sceneBlock'), assignmentId: Id, blockId: Id, field: z.literal('text') })`; `fieldLimit` → `{ max: 10000, singleLine: false }`; `draftHasText` → `true`; `AiTextBody` gains `length: LengthChoiceSchema.optional()`.
- `SceneDescriptionBody` and `ManuscriptResponse` otherwise unchanged. Add `BlockDraftBody = z.object({ length: LengthChoiceSchema.optional() })` to `manuscript.ts`.

- [ ] Step 1: tests — `splitBlockText('Mara fragte. „Jon antwortete.“', 13)` → `['Mara fragte. ', '„Jon antwortete.“']` and `a+b === original`; caret 0 / length → null; `joinBlocks(['a'])==='a'`, `joinBlocks(['a','b'])==='a\n\nb'`; `SceneBlocksBody` rejects 0 blocks, 201 blocks, 10001 chars, duplicate ids, keeps leading/trailing spaces; `WordRangeSchema` rejects min>max, 0, 2_000_001, non-int; `BookPatchBody` accepts `{title}`, `{targetWords:null}`, rejects `{}`; `AiTextBody` accepts sceneBlock target with `generate` on empty text and with and without `length`; `fieldLimit(sceneBlock).max === 10000`.
- [ ] Step 2: run `npm -w packages/shared test` → FAIL.
- [ ] Step 3: implement.
- [ ] Step 4: `npm -w packages/shared test` PASS; `npm run typecheck` may fail in server/web on new required fields (`blocks`, `revision`) — fix only fixture compile errors needed (web `sceneTestFixtures.ts` etc. add `blocks`, `revision`).
- [ ] Step 5: commit `feat(shared): scene blocks, word range and length choice contracts`.

### Task 2: Server persistence — migration, book range, blocks API

**Files:**
- Modify: `packages/server/src/db/schema.ts`, `packages/server/src/db/loadBook.ts`, `packages/server/src/db/loadScenes.ts`, `packages/server/src/books/routes.ts`, `packages/server/src/books/scenes.ts`, `packages/server/src/manuscript/load.ts`
- Create: `packages/server/drizzle/0008_scene_blocks.sql` (+ `meta/_journal.json` entry, `meta/0008_snapshot.json` via `npm -w packages/server run db:generate -- --name scene_blocks`, then append data statements by hand), `packages/server/src/books/sceneBlocks.ts` (blocks route + `writeBlocks` helper, keeps `scenes.ts` from growing)
- Test: `packages/server/src/books/sceneBlocks.test.ts`, `packages/server/src/books/books.test.ts`

**Interfaces:**
- Consumes Task 1 types.
- Produces: `writeBlocks(tx: Tx, assignmentId: Id, texts: { id?: Id; text: string }[]): Promise<void>` (deletes omitted, updates kept, inserts new at array positions, sets `description = joinBlocks`, `updatedAt = now`, `revision = revision + 1`). Route `PUT /api/books/:bookId/scene-assignments/:assignmentId/blocks` → `BookResponse`; errors 400 `invalid_body`, 400 `unknown_block`, 404, 409 `stale`. `GET /api/books/:id` returns `book.targetWords` and each assignment's `blocks` (by position) and `revision`.
- Migration SQL (after generated DDL): `INSERT INTO scene_assignment_blocks (assignment_id, position, text) SELECT id, 0, description FROM scene_assignments;` Unique index `(assignment_id, position)` must be deferrable or `writeBlocks` must avoid transient duplicates (delete all rows of the assignment then reinsert with preserved ids — chosen: delete+reinsert inside the tx, ids preserved).

- [ ] Step 1: tests — (a) migration: insert a `scene_assignments` row via raw SQL with blocks deleted, then call the same `INSERT…SELECT` statement from the migration file text; assert one block, exact text including `'  Zeile\n\nzwei  '` and empty string. (b) PUT reorders/splits for section target and storyline target, response blocks in order, `description === joinBlocks`, `revision` +1. (c) stale revision → 409, unchanged. (d) id of block of another assignment of same scene → 400 `unknown_block`, unchanged. (e) PATCH description (old request, no revision) → single block with that text; with stale revision → 409. (f) POST assignment → one block = description. (g) book PATCH `{targetWords:{min:60000,max:90000}}`, then `{title}` keeps range, `{targetWords:null}` clears; invalid → 400; other user → 404. (h) manuscript GET returns `book.targetWords`.
- [ ] Step 2: run `TEST_DATABASE_URL=… npm -w packages/server test -- sceneBlocks books` → FAIL.
- [ ] Step 3: implement; all writes via `app.mutate(bookId, …)` (book row lock = concurrency serialisation); revision check inside the mutation.
- [ ] Step 4: full server tests PASS.
- [ ] Step 5: commit `feat(server): persist scene assignment blocks and book word range`.

### Task 3: Server AI — scene block wand and length guidance

**Files:**
- Create: `packages/server/src/ai/sceneBlockContext.ts`, `packages/server/src/ai/lengthGuidance.ts`
- Modify: `packages/server/src/books/aiRoutes.ts` (branch for `target.kind === 'sceneBlock'`), `packages/server/src/ai/textContext.ts` (throw for `sceneBlock`: handled elsewhere), `packages/server/src/ai/structurePrompt.ts` (`DraftContext` gains `targetWords?: WordRange|null; length?: LengthChoice`; scene `beschreibung` sliced to 2000 in `scenesOf`; structure user JSON gains `zielumfang` when set), `packages/server/src/manuscript/proposals.ts` (parse `BlockDraftBody`, pass range/length, slice scene description to 2000), `packages/server/src/ai/fake.ts` (none needed unless tests require)
- Test: `packages/server/src/ai/sceneBlockContext.test.ts`, `packages/server/src/ai/lengthGuidance.test.ts`, `packages/server/src/books/aiRoutes.test.ts`, `packages/server/src/ai/structurePrompt.test.ts`

**Interfaces:**
- `lengthGuidance(range: WordRange | null | undefined, length: LengthChoice = 'book', fallback: string): string` — returns `fallback` when no range and `book`; otherwise the spec wording (spec §5 „Prompt-Text Umfang“). `draftRequest` uses fallback `'Etwa 300 bis 600 Wörter.'` and keeps `DRAFT_SYSTEM` byte-identical in that case; short/long without range: `'Etwa 150 bis 300 Wörter.'` / `'Etwa 600 bis 1000 Wörter.'`.
- `loadSceneBlockContext(db, bookId, assignmentId, blockId): Promise<{ fieldLabel: 'Szenentext'; context: Record<string, unknown> }>` — throws `NotFoundError` unless block ∈ assignment ∈ scene ∈ book. Context keys: `buch`, `szene { name, notizen (≤4000 chars total) }`, `ort { art: 'Abschnitt'|'Storyline', titel, beschreibung, storyline }`, `figuren [{ name, beschreibung }]` (section.characterIds or storyline.characterIds), `textDavor` (last 3000 chars of earlier blocks joined), `textDanach` (first 1500 chars of later blocks), `zielumfang` (lengthGuidance text).
- `sceneBlockRequest(ctx, body): AiRequest` in `sceneBlockContext.ts` wraps `textRequest` and appends to `system`: `'Der Text ist ein Block eines Szenentextes (Prosa). Bearbeite nur diesen Block; textDavor und textDanach sind Umgebung und werden nie wiederholt oder verändert.'` plus for `generate`/`continue` the length line replacing „1–3 Sätze“ semantics: `'Umfang: ' + lengthGuidance(range, length, 'ein bis drei Absätze')`.

- [ ] Step 1: tests — section target: figures of the section only, `textDavor`/`textDanach` from neighbours, current block excluded; storyline target: storyline figures; foreign block/assignment → 404 and fake `complete` not called; route returns 3 suggestions for `generate` on empty block; `lengthGuidance(null,'book',F)===F`; with range contains `60000–90000` and „keine Vorgabe für diese Passage“ and never „pro Szene“; `draftRequest` without range/length `.system === DRAFT_SYSTEM` (old string); draft route with body `{length:'short'}` reaches the model with „knapp“; structure request with range includes `zielumfang`, scene description sliced to 2000.
- [ ] Step 2: run → FAIL.  Step 3: implement.  Step 4: server tests PASS.
- [ ] Step 5: commit `feat(server): scoped AI context for scene blocks and book length guidance`.

### Task 4: Web — word range panel and draft length

**Files:**
- Create: `packages/web/src/manuscript/LengthPanel.tsx`, `packages/web/src/ai/LengthSelect.tsx`
- Modify: `packages/web/src/manuscript/ManuscriptPage.tsx` (tab `{ id: 'length', label: 'Umfang' }` after „Stil“), `packages/web/src/manuscript/BlockEditor.tsx` (LengthSelect beside „KI-Entwurf“; send `{ length }`), `packages/web/src/manuscript/manuscriptApi.ts` (`useBlockDraft` variables `{ blockId, length }`)
- Test: `packages/web/src/manuscript/LengthPanel.test.tsx`, `packages/web/src/manuscript/ManuscriptPage.test.tsx` (draft sends length)

**Interfaces:** `LengthSelect({ value, onChange, label = 'Länge' })` — `<select aria-label={label}>` with LENGTH_LABELS. `LengthPanel({ bookId, ms })`: author → number inputs „Wörter von“/„Wörter bis“, „Speichern“ (PATCH `/api/books/:id` `{ targetWords }`, then invalidate manuscript query), „Entfernen“ (`null`); reviewer → read-only text „Etwa X–Y Wörter“ or „Kein Zielumfang festgelegt.“; invalid input (min>max, empty) → inline error, no request.

- [ ] Step 1: tests (save sends exact body; clear sends null; min>max shows „Von darf nicht größer als bis sein.“ and no request; reviewer read-only; draft request body `{length:'long'}` after choosing „ausführlich“).  Step 2: FAIL.  Step 3: implement.  Step 4: `npm -w packages/web test` PASS.  Step 5: commit `feat(web): book word range and draft length choice`.

### Task 5: Web — scene block editor with per-block wand

**Files:**
- Create: `packages/web/src/scene/SceneBlocks.tsx`, `packages/web/src/scene/blockOps.ts` (pure ops)
- Modify: `packages/web/src/scene/SceneAssignments.tsx` (`AssignmentRow` renders `<SceneBlocks>` instead of the single description textarea; keep proposal/earlier-description/„Neu erzeugen“ flow: while a proposal is open show the old single textarea with the proposal; `onSave` PATCH sends `revision`), `packages/web/src/ai/MagicWand.tsx` (optional prop `length?: LengthChoice` included in body only when set)
- Test: `packages/web/src/scene/blockOps.test.ts`, `packages/web/src/scene/SceneBlocks.test.tsx`

**Interfaces:**
- `blockOps.ts`: `type DraftBlock = { id?: Id; text: string }`; `splitAt(blocks, index, caret): DraftBlock[] | null`; `insertAfter(blocks, index | null): DraftBlock[]`; `undoSplit(blocks, record: SplitRecord): DraftBlock[] | null` where `SplitRecord = { firstId: Id; secondId: Id; first: string; second: string }` (null if either half changed); `removeEmpty(blocks, index)`; all return the list to PUT.
- `SceneBlocks({ bookId, assignment, aiEnabled })`: one `div.wand-field` per block with `<textarea aria-label={`Block ${i+1} Szene ${name}`}>` + `<MagicWand target={{kind:'sceneBlock', assignmentId, blockId, field:'text'}} length={length} …/>`; tracks active block index and caret (onSelect/onKeyUp/onClick/onFocus); toolbar: LengthSelect, „Hier teilen“ (disabled unless caret strictly inside and no selection), „Block einfügen“, „Teilung rückgängig“ (only after own split while halves unchanged), „Leeren Block entfernen“ (only active empty block and >1 blocks). Text saved on blur when changed via PUT with full list; structural ops PUT immediately; after insert focus the new block once the response arrives. 409 → show stale message (role=alert) and invalidate `['book', bookId]`.

- [ ] Step 1: tests — blockOps exactness; component: split sends `[{id:a,text:before},{text:after}]` + revision; insert after active sends new empty block at index+1; undo split restores original; wand on block 2 with selection replaces only selection in block 2 and PUT on blur leaves block 1/3 text identical; typing in block 1 then blur PUTs only changed text with other blocks unchanged; 409 shows stale message; storyline target renders blocks too.
- [ ] Step 2: FAIL.  Step 3: implement.  Step 4: web tests PASS, typecheck PASS.
- [ ] Step 5: commit `feat(web): write scenes in ordered blocks with a per-block wand`.

### Task 6: E2E full example, ports, docs, gates

**Files:**
- Modify: `playwright.config.ts` (ports from `E2E_API_PORT` default 3100 / `E2E_WEB_PORT` default 5174), `README.md` (features, env vars), `docs/superpowers/specs/2026-11-21-szenen-design.md` (one-line pointer to the new design)
- Create: `e2e/scene-writing.spec.ts`

- [ ] Step 1: e2e — register, book, time points, main storyline with section, side storyline, character „Jon“ on the section; scene „Hafen“; assign to section with description `Mara fragte: „Wohin gehst du?“ Jon antwortete: „Zum Hafen.“`; place caret before `Jon antwortete`, „Hier teilen“; „Block einfügen“ after block 1; wand → „Vorschlagen“ on the empty block 2 → block 2 shows `KI-Vorschlag 1`; blur; reload; blocks in order `[Mara fragte: „Wohin gehst du?“ , KI-Vorschlag 1, Jon antwortete: „Zum Hafen.“]` with block 1 and 3 exact; also assign the same scene to the side storyline and assert its block list is independent.
- [ ] Step 2: run with the isolated env → PASS.
- [ ] Step 3: gates: `npm run typecheck`, `TEST_DATABASE_URL=… npm test`, e2e full suite with isolated env.
- [ ] Step 4: commit `test(e2e): split, insert and draft one scene block`.
