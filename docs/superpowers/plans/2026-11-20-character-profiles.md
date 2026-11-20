# Character Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend bookly's characters into profiles (description, behaviour, intentions) with per-storyline additions, AI suggestions, and AI contradiction warnings checked in a background queue.

**Architecture:** `shared` gets the new domain types, zod bodies and the criteria catalogue. `server` gets new columns/tables, an `ai/` module (OpenRouter client, pure prompt builders, a Postgres-backed check queue with an in-process worker), and an `app.mutate()` wrapper that runs the existing `mutateBook` pipeline, enqueues checks whose input changed, and returns the extended `BookResponse`. `web` polls the book while a check is pending and renders profile fields, suggestion boxes, addition expanders and a "Figuren" hint group.

**Tech Stack:** existing stack (TypeScript, zod, Fastify 5, Drizzle + postgres-js, React 18 + TanStack Query 5, Vitest + Testing Library + msw, Playwright). OpenRouter via plain `fetch` (no SDK). `node:crypto` for hashes.

**Spec:** `docs/superpowers/specs/2026-11-20-character-profiles-design.md` (German). Read it before any task; §-numbers below refer to it. The earlier `2026-11-20-storylines-design.md` describes the existing app.

## Global Constraints

- UI copy is German; code, comments, commit messages English. Every exported function and source file has a short doc comment.
- All profile fields optional (FR-002). Unnamed character label: `Unbenannte Figur`. Unnamed characters sort last.
- Field limits: `name` 200, `description`/`behavior`/`intentions` 2000 chars each (additions too).
- Saving never waits for or fails because of the AI. Warnings never block anything.
- Env: `OPENROUTER_API_KEY` (absent → AI off), `OPENROUTER_MODEL` (required when key set; server refuses to start without it), `AI_FAKE=1` (fake client, used by e2e).
- OpenRouter: `POST https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer <key>`, `response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } }`.
- Timeouts: check 60 s, suggestion 30 s. Worker: poll 2 s, quiet period 5 s, concurrency 2, stale `running` reset after 5 min.
- AI criteria keys: `behavior_change`, `intention_conflict`, `relationship_conflict`. Labels: `Verhalten weicht ab`, `Widersprüchliche Absichten`, `Widerspruch in Beziehungen`.
- Ack copy: `Auch künftige Hinweise dieser Art für {Figur} in dieser Storyline werden gedämpft.`
- Every new `/api/books/:bookId/...` route uses `requireUser` + `bookGuard()` and `assertInBook` for child ids (404 on foreign ids).
- Tests never call the network: server tests inject a fake `AiClient`.

## Review Focus

1. **Storyline PATCH with `characterIds`** today deletes and re-inserts links. It must keep the additions of characters that stay, and delete additions + acks of removed ones. → Task 3 test `keeps additions of retained characters`.
2. **Character or storyline deleted while its check runs**: the worker must not crash or insert warnings for missing rows; it drops warnings for unknown characters and treats a vanished storyline as done. → Task 6 tests `skips vanished storyline` and `drops warnings for deleted character`.
3. **Model returns malformed or off-schema output** (model without json_schema support, prose, unknown ids): check ends `failed` with a short message, previous warnings stay. → Task 6 test `failed run keeps previous warnings`, Task 5 parser tests.
4. **Rapid successive saves while typing**: exactly one pending job per storyline, no AI call before 5 s quiet. → Task 6 test `coalesces rapid enqueues`.
5. **Two unnamed characters in one storyline**: prompt identifies characters by id plus label, so warnings map to the right one. → Task 5 test `distinguishes unnamed characters by id`.

---

### Task 1: Shared domain, bodies and criteria

**Files:**
- Modify: `packages/shared/src/domain.ts`, `packages/shared/src/schemas.ts`, `packages/shared/src/hints.ts` (`nameOf` uses `characterLabel`), `packages/shared/src/index.ts`
- Create: `packages/shared/src/criteria.ts`
- Test: `packages/shared/src/schemas.test.ts`, `packages/shared/src/criteria.test.ts`

**Interfaces — Produces:**
- `Character { id; name: string | null; description: string | null; behavior: string | null; intentions: string | null }`
- `CharacterAddition { characterId: Id; behavior: string | null; intentions: string | null }`; `Storyline.additions: CharacterAddition[]` — one entry per storyline–character link, fields null when empty.
- `characterLabel(c: Pick<Character,'name'> | undefined): string` → name or `Unbenannte Figur`.
- `type CharacterCriterion = 'behavior_change' | 'intention_conflict' | 'relationship_conflict'`
- `CHARACTER_CRITERIA: readonly { key: CharacterCriterion; label: string; description: string }[]`, `CRITERIA_VERSION = 1`
- `CharacterWarning { id; storylineId; characterId; criterion; message; acknowledged: boolean }`
- `CheckStatus = 'pending' | 'running' | 'done' | 'failed'`; `CharacterCheck { storylineId; status; finishedAt: string | null; error: string | null }`
- `BookResponse { book; hints; characterWarnings: CharacterWarning[]; characterChecks: CharacterCheck[]; ai: { enabled: boolean } }`
- Zod: `CharacterBody` (all four fields `.nullish()`; strings trimmed, empty → null via `.transform`), `AdditionBody { behavior?: string|null; intentions?: string|null }`, `CharacterWarningAckBody { storylineId; characterId; criterion }`, `SuggestionBody { name?, description?, behavior?, intentions? }` (draft values, all nullish), `Suggestion { behavior: string; intentions: string }` (type + zod `SuggestionResult`).

- [ ] **Step 1: Write failing tests**
  - `schemas.test.ts`: `CharacterBody.parse({})` → `{}`; `CharacterBody.parse({ name: '  ' })` → `{ name: null }`; `description` of 2001 chars fails; `AdditionBody.parse({ behavior: 'x' })` ok.
  - `criteria.test.ts`: keys equal `['behavior_change','intention_conflict','relationship_conflict']`; every entry has non-empty label and description; `characterLabel({ name: null })` → `'Unbenannte Figur'`.
- [ ] **Step 2:** `npm -w packages/shared test` → FAIL.
- [ ] **Step 3:** Implement. Criterion descriptions (German, used in prompts): spec §6 table wording.
- [ ] **Step 4:** `npm -w packages/shared test` → PASS. `npm run typecheck` will now fail in server/web; that is expected and fixed by Tasks 2–3 and 8.
- [ ] **Step 5:** Commit `feat(shared): character profile types, bodies and criteria catalogue`.

### Task 2: Schema, migration and loading

**Files:**
- Modify: `packages/server/src/db/schema.ts`, `packages/server/src/db/loadBook.ts`
- Create: `packages/server/drizzle/0001_*.sql` (generated), `packages/server/src/db/bookResponse.ts`
- Test: `packages/server/src/db/bookResponse.test.ts`

**Interfaces — Produces:**
- `characters.name` nullable; `characters.behavior`, `characters.intentions` text nullable.
- `storylineCharacters.behavior`, `.intentions` text nullable.
- `characterChecks` (`character_checks`): `storylineId` uuid PK → storylines cascade; `status` text; `inputHash` text nullable (hash of the **last attempted** input); `requestedAt`, `startedAt`, `finishedAt` timestamptz; `error` text; `model` text.
- `characterWarnings` (`character_warnings`): `id`, `storylineId` → cascade, `characterId` → characters cascade, `criterion`, `message`, `createdAt`.
- `characterWarningAcks` (`character_warning_acks`): PK (`storylineId`, `characterId`, `criterion`), both FKs cascade.
- `loadBook`: characters ordered `name asc nulls last, id`; `Storyline.additions` from `storyline_characters`.
- `bookResponse(db: Db | Tx, book: Book, aiEnabled: boolean): Promise<BookResponse>` — runs `checkBook`, loads checks and warnings for the book's storylines, sets `acknowledged` by ack key.

- [ ] **Step 1:** Write failing test `bookResponse.test.ts`: seed book + storyline + character via fixtures, insert a warning and a matching ack row directly, assert `characterWarnings[0].acknowledged === true`, `characterChecks` empty, `ai.enabled` as passed.
- [ ] **Step 2:** `npm -w packages/server test -- bookResponse` → FAIL.
- [ ] **Step 3:** Edit schema, run `npm -w packages/server run db:generate`, implement loader and `bookResponse`. Replace the three `{ book, hints: checkBook(book) }` constructions in `books/routes.ts` with `bookResponse(...)` — pass `aiEnabled: false` for now; Task 7 switches every caller to `app.mutate` / `app.ai !== null`.
- [ ] **Step 4:** `npm -w packages/server test` → PASS (all existing tests too).
- [ ] **Step 5:** Commit `feat(server): profile columns, check tables and extended book response`.

### Task 3: Profile and addition routes, link-preserving storyline save

**Files:**
- Modify: `packages/server/src/books/characters.ts`, `packages/server/src/books/storylines.ts` (`setCharacters`), `packages/server/src/test/fixtures.ts` (`seedCharacter` name optional)
- Create: `packages/server/src/books/additions.ts`, `packages/server/src/books/additions.test.ts`
- Test: `packages/server/src/books/characters.test.ts`, `packages/server/src/books/storylines.test.ts`

**Interfaces — Produces:**
- `POST/PATCH /api/books/:bookId/characters[/:id]` accept `CharacterBody`; PATCH sets only provided keys; POST with `{}` creates an empty character (EC-001).
- `PUT /api/books/:bookId/storylines/:storylineId/characters/:characterId/addition` body `AdditionBody` → `BookResponse`; 404 when the character is not linked to the storyline.
- `setCharacters(tx, storylineId, ids)`: inserts new links, deletes removed links **and** their acks; untouched links keep `behavior`/`intentions`.

- [ ] **Step 1: Failing tests**
  - characters: `creates an empty character` (POST `{}` → 201, character all-null); `patches behaviour only` (other fields unchanged); old test's `name: ''` now yields `name: null` with 200 instead of 400 — update it.
  - additions: `sets and clears an addition`; `404 for unlinked character`; `404 for foreign book`.
  - storylines: `keeps additions of retained characters` — link A and B, set addition on A, PATCH `characterIds: [A]` then `[A, C]`; A's addition unchanged, B's link and ack rows gone.
- [ ] **Step 2:** `npm -w packages/server test` → new tests FAIL.
- [ ] **Step 3:** Implement; register `additionRoutes` in `app.ts`.
- [ ] **Step 4:** `npm -w packages/server test` → PASS.
- [ ] **Step 5:** Commit `feat(server): character profiles and per-storyline additions`.

### Task 4: AI client and configuration

**Files:**
- Create: `packages/server/src/ai/client.ts`, `packages/server/src/ai/client.test.ts`, `packages/server/src/ai/fake.ts`
- Modify: `packages/server/src/app.ts` (`AppConfig.ai?: AiClient | null`, decorate `app.ai`), `packages/server/src/index.ts`, `.env.example`, `README.md` (env table)

**Interfaces — Produces:**
- `interface AiRequest { system: string; user: string; schemaName: string; schema: Record<string, unknown>; timeoutMs: number }`
- `interface AiClient { model: string; complete(req: AiRequest): Promise<unknown> }` — resolves to the parsed JSON of `choices[0].message.content`.
- `class AiError extends Error` (message short, German-free, ≤ 200 chars).
- `createOpenRouterClient(opts: { apiKey: string; model: string; fetch?: typeof fetch }): AiClient`
- `createFakeAiClient(): AiClient` — model `fake`; for schema `character_check` returns one `behavior_change` warning for the first character id found in the user message whose text contains `FAKE-WIDERSPRUCH`, else `{ warnings: [] }`; for `character_suggestion` returns `{ behavior: 'Vorschlag Verhalten', intentions: 'Vorschlag Absichten' }`.
- `aiFromEnv(env: NodeJS.ProcessEnv): AiClient | null` — `AI_FAKE=1` → fake; key without model → throws `Error('OPENROUTER_MODEL is required when OPENROUTER_API_KEY is set')`.

- [ ] **Step 1: Failing tests** with a stub `fetch`: request URL, method, bearer header, body has `model`, two messages, `response_format.json_schema.name === schemaName`; returns parsed content; non-2xx → `AiError`; content not JSON → `AiError`; abort after `timeoutMs` → `AiError`; `aiFromEnv` three cases.
- [ ] **Step 2:** `npm -w packages/server test -- client` → FAIL.
- [ ] **Step 3:** Implement with `AbortSignal.timeout(timeoutMs)`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(server): OpenRouter client and AI configuration`.

### Task 5: Prompt builders and response parsing

**Files:**
- Create: `packages/server/src/ai/checkPrompt.ts`, `packages/server/src/ai/suggestPrompt.ts`, tests next to them

**Interfaces — Produces:**
- `interface CheckInput { storyline: { title; description; note }; sections: { title; description; note; characterIds: Id[] }[]; characters: { id; label; description; behavior; intentions; addition: { behavior; intentions } | null }[] }`
- `buildCheckInput(book: Book, storylineId: Id): CheckInput | null` — null when the storyline is missing or has no characters (own + section characters). Section-only characters get `addition: null`.
- `inputHash(input: CheckInput, model: string): string` — sha256 hex of `JSON.stringify({ input, model, v: CRITERIA_VERSION })`.
- `checkRequest(input: CheckInput): AiRequest` — schemaName `character_check`, timeout 60 000, schema `{ warnings: [{ characterId: enum(ids), criterion: enum(keys), message: string }] }`. System prompt German: role, the three criteria with descriptions, "Grundprofil + Ergänzung gilt", "Beziehungen stehen in den Beschreibungen", "nur echte Widersprüche, keine Stilkritik", "message: 1–2 Sätze, nenne die Stelle". User message: JSON of `input`.
- `parseCheckResponse(raw: unknown, input: CheckInput): { characterId: Id; criterion: CharacterCriterion; message: string }[]` — throws `AiError('invalid_response')` when shape is wrong; silently drops entries with unknown ids/criteria; trims message, max 1000 chars.
- `suggestRequest(ctx: { character: SuggestionBody; storyline?: { title; description; note; sections: { title; description }[] } }): AiRequest` — schemaName `character_suggestion`, timeout 30 000; with `storyline` the prompt asks only for what differs in that storyline.
- `parseSuggestion(raw: unknown): Suggestion` — throws `AiError('invalid_response')`.

- [ ] **Step 1: Failing tests:** input includes section-only character without addition; null for storyline without characters; hash changes when an addition changes and is stable otherwise; `distinguishes unnamed characters by id` (two unnamed → both `label: 'Unbenannte Figur'`, distinct ids, schema enum has both); parse drops unknown id and unknown criterion; parse throws on `{ foo: 1 }`; suggestion prompt with storyline contains its title.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(server): prompts and parsing for character checks and suggestions`.

### Task 6: Check queue and worker

**Files:**
- Create: `packages/server/src/ai/queue.ts`, `packages/server/src/ai/worker.ts`, `packages/server/src/ai/worker.test.ts`

**Interfaces — Consumes:** Tasks 2, 4, 5. **Produces:**
- `enqueueChanged(db: Db, book: Book, model: string): Promise<void>` — for each storyline with a `CheckInput`: no row or `inputHash !== hash` and status not `running` → upsert `pending`, `requestedAt = now()`. If status `pending`, bump `requestedAt` regardless. Storylines without input: delete their check row and warnings.
- `enqueueForced(db: Db, storylineIds: Id[]): Promise<void>` — upsert `pending` (unless `running`), `requestedAt = now()`.
- `createCheckWorker(opts: { db: Db; ai: AiClient; log: FastifyBaseLogger; pollMs?: number; quietMs?: number; concurrency?: number }): { start(): void; stop(): Promise<void>; runOnce(): Promise<number> }`
  - `start`: resets `running` with `startedAt < now() - 5 min` to `pending`, then polls.
  - Claim SQL (one statement): `UPDATE character_checks SET status='running', started_at=now() WHERE storyline_id IN (SELECT storyline_id FROM character_checks WHERE status='pending' AND requested_at <= now() - $quiet ORDER BY requested_at LIMIT $n FOR UPDATE SKIP LOCKED) RETURNING storyline_id`.
  - Per job: load book via storyline → `buildCheckInput` (null → delete row, done); store `inputHash`/`model`; call `ai.complete(checkRequest(input))` → `parseCheckResponse`; in one transaction delete+insert warnings (filtering ids that still exist), set `done`, `finishedAt`, `error=null`; then recompute hash from a fresh load and set `pending` if different. On error: `failed`, `error = message.slice(0,200)`, warnings untouched.
  - `runOnce` returns jobs processed (awaits them).

- [ ] **Step 1: Failing tests** (fake `AiClient` with call counter, `quietMs: 0` unless stated): `processes a pending check`; `skips unchanged input` (second `enqueueChanged` after done → no row change, AI called once); `coalesces rapid enqueues` (`quietMs: 5000`, three enqueues → one pending row, `runOnce` returns 0); `failed run keeps previous warnings`; `re-queues when input changed during run` (AI stub edits the storyline before resolving); `skips vanished storyline` (delete storyline before `runOnce`); `drops warnings for deleted character`; `failed check is not retried automatically` (`enqueueChanged` with same input leaves `failed`).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(server): Postgres-backed character check queue and worker`.

### Task 7: Wiring: mutate wrapper, check, ack and suggestion routes

**Files:**
- Create: `packages/server/src/books/mutateWithChecks.ts`, `packages/server/src/books/aiRoutes.ts`, `packages/server/src/books/aiRoutes.test.ts`
- Modify: every route file using `mutateBook` (books, timepoints, characters, additions, storylines, sections, connections, acknowledgements) to call `app.mutate(bookId, change)`; `app.ts`; `index.ts` (create worker when `app.ai`, `start()` after listen, `stop()` on close)

**Interfaces — Produces:**
- `app.mutate(bookId: Id, change: (tx: Tx) => Promise<void>): Promise<BookResponse>` — `mutateBook`, then `enqueueChanged` when `app.ai`, then `bookResponse(...)` (so a fresh `pending` shows up in the response).
- `POST /api/books/:bookId/storylines/:storylineId/character-check` → `enqueueForced`, `BookResponse`.
- `POST /api/books/:bookId/character-checks` → force all storylines with input.
- `POST|DELETE /api/books/:bookId/character-warning-acks` body `CharacterWarningAckBody` → `BookResponse`; POST requires the character linked to the storyline (own or section), else 400 `{ error: 'not_linked' }`.
- `POST /api/books/:bookId/characters/:characterId/suggestion` body `SuggestionBody` → `Suggestion`.
- `POST /api/books/:bookId/storylines/:storylineId/characters/:characterId/suggestion` body `SuggestionBody` → `Suggestion`.
- AI off: check and suggestion routes → 503 `{ error: 'ai_disabled' }`. AI failure in suggestion → 502 `{ error: 'ai_failed' }`.

- [ ] **Step 1: Failing tests** (app built with fake client via `buildApp({ ..., ai })`; extend `testApp(opts?)`): saving a storyline with a character returns a `pending` check; saving an unrelated book title does not create checks for unchanged storylines; forced check works; ack then GET shows `acknowledged: true` for a later warning of the same key; suggestion returns fake values; AI off → 503 for all four AI routes and `ai.enabled === false`; foreign book → 404.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** `npm -w packages/server test && npm run typecheck -w packages/server` → PASS.
- [ ] **Step 5:** Commit `feat(server): enqueue checks on save, AI check, ack and suggestion routes`.

### Task 8: Web — profile fields, suggestions and polling

**Files:**
- Modify: `packages/web/src/api/hooks.ts` (`useBook` `refetchInterval`), `packages/web/src/book/CharacterPanel.tsx`, `packages/web/src/book/testFixtures.ts` (new response fields), every web use of `c.name` for display → `characterLabel(c)`
- Create: `packages/web/src/character/SuggestionBox.tsx`, `packages/web/src/character/useSuggestion.ts`
- Test: `packages/web/src/book/CharacterPanel.test.tsx`, `packages/web/src/api/hooks.test.ts` (if absent, add to `BookPage.test.tsx`)

**Interfaces — Produces:**
- `useBook`: `refetchInterval: (q) => q.state.data?.characterChecks.some(c => c.status === 'pending' || c.status === 'running') ? 2000 : false`.
- `useSuggestion(path: string): { suggestion: Suggestion | null; loading: boolean; error: string | null; request(draft: SuggestionBody): void; dismiss(): void }` — ignores `request` while loading.
- `<SuggestionBox suggestion fields={{ behavior: string; intentions: string }} onApply={(field, value) => void} onDismiss />` — per field „Übernehmen“; when the current field is non-empty, `window.confirm('Vorhandenen Text ersetzen?')` first; „Verwerfen“ dismisses.
- CharacterPanel per character: name, Beschreibung, Verhalten, Absichten (textareas, save on blur as today), button „Vorschlagen“ (disabled with title „KI nicht eingerichtet“ when `!ai.enabled`). Description blur with a changed value also triggers `request` when AI is enabled. No request on mount.

- [ ] **Step 1: Failing tests:** renders four fields; empty name saves `name: null` and shows „Unbenannte Figur“ in the delete label; changing description and blurring posts PATCH and one suggestion request; opening panel posts no suggestion request; „Übernehmen“ on non-empty field asks confirm and PATCHes; „Vorschlagen“ disabled when `ai.enabled` false; polling active while a check is `pending` (fake timers, two GETs).
- [ ] **Step 2:** `npm -w packages/web test` → FAIL. **Step 3:** Implement. **Step 4:** PASS + `npm run typecheck`.
- [ ] **Step 5:** Commit `feat(web): character profile fields with AI suggestions`.

### Task 9: Web — storyline additions and check status

**Files:**
- Modify: `packages/web/src/storyline/CharacterChecks.tsx`, `packages/web/src/storyline/StorylinePanel.tsx`
- Create: `packages/web/src/storyline/AdditionEditor.tsx`, `packages/web/src/storyline/CheckStatus.tsx`
- Test: `packages/web/src/storyline/StorylinePanel.test.tsx`

**Interfaces — Consumes:** Task 8 `useSuggestion`, `SuggestionBox`. **Produces:**
- `CharacterChecks` gets optional `storyline?: Storyline` and `aiEnabled`; in edit mode each checked character has an expand toggle (`aria-expanded`) showing `AdditionEditor`; in create mode no toggle.
- `AdditionEditor`: fields „Verhalten“, „Absichten“ (PUT addition on blur), greyed line `Grundprofil: {behavior} · {intentions}` (omit empty parts; hide line if both empty), „Vorschlagen“. Storyline title/description/note blur with change triggers suggestions only for expanded editors.
- Unchecking a character whose addition has text: `window.confirm('Ergänzung für {label} geht verloren. Entfernen?')`; cancel keeps it.
- `CheckStatus` above the character list: `Prüfe Figuren…` (pending/running), `Geprüft vor {n} min` (done; `gerade eben` under 1 min), `Prüfung fehlgeschlagen – erneut versuchen` (failed, the link re-checks), button „Figuren prüfen“; AI off: `KI nicht eingerichtet`, button disabled. No status row exists → only the button.

- [ ] **Step 1: Failing tests:** expand shows base profile line; blur on addition PUTs body `{ behavior: '…' }`; create mode has no expand toggle; uncheck with text asks confirm, cancel sends nothing; status texts for each state; „Figuren prüfen“ posts the check route.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(web): per-storyline character additions and check status`.

### Task 10: Web — „Figuren“ warnings in the hint list

**Files:**
- Modify: `packages/web/src/book/BookHints.tsx`, `packages/web/src/book/BookPage.tsx` (pass warnings, open storyline on click)
- Test: `packages/web/src/book/BookHints.test.tsx` (create)

**Interfaces — Produces:** `BookHints` gets `warnings: CharacterWarning[]` and `onShowStoryline(id)`. Group heading „Figuren“, item: storyline title · `characterLabel` · criterion label, message, button „Bewusst so“ (open items) / „Wieder anzeigen“ (acknowledged). „Bewusst so“ shows the ack copy from Global Constraints via `window.confirm` and POSTs the ack; „Wieder anzeigen“ DELETEs it. Count badge includes open warnings; acknowledged ones fold into the existing `details`. Button „Alle prüfen“ in the section posts `/character-checks` (disabled when AI off).

- [ ] **Step 1: Failing tests:** open warning counted in badge; ack confirm text names the character; acknowledged warning in folded list; „Alle prüfen“ posts.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(web): character warnings in the hint list`.

### Task 11: End-to-end flow and docs

**Files:**
- Modify: `playwright.config.ts` (API env `AI_FAKE: '1'`), `README.md` (feature list, env vars), `.env.example`
- Create: `e2e/characters.spec.ts`

- [ ] **Step 1: Write the e2e test:** register, create book, time points, storyline; add character with behaviour; link it in the storyline, expand, enter addition; set storyline description containing `FAKE-WIDERSPRUCH`; wait for the „Figuren“ hint (≤ 15 s, quiet period 5 s); click „Bewusst so“, confirm; hint moves to the folded list.
- [ ] **Step 2:** `npm run e2e` → PASS (needs `bookly_e2e`).
- [ ] **Step 3:** `npm test && npm run typecheck` → PASS.
- [ ] **Step 4:** Commit `test: end-to-end character profile flow; docs: AI configuration`.
