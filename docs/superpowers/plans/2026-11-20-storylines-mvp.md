# Storylines MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build bookly, a web app where authors visually develop storylines of a book on a story timeline, connect them with typed links and get instant contradiction hints.

**Architecture:** pnpm monorepo with three packages. `shared` holds domain types, range semantics, validation and the hint engine as pure functions. `server` (Fastify + Drizzle + PostgreSQL) persists data, runs every mutation in a transaction, re-validates the whole book with `shared` and rolls back on issues. `web` (React + Vite) renders the storyline map as SVG and computes hints locally with the same `shared` code. Every mutating endpoint returns the full book aggregate, so the client replaces its cached copy.

**Tech Stack:** Node 22, pnpm 9 workspaces, TypeScript 5 (strict), Vitest, zod, Fastify 5, @fastify/cookie, Drizzle ORM + drizzle-kit + postgres (postgres-js), @node-rs/argon2, PostgreSQL 16 (Docker Compose), React 18, Vite 5, TanStack Query 5, react-router 6, d3-zoom, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-20-storylines-design.md` (German). Read it before any task. Section numbers below (§6, §7 …) refer to it.

## Global Constraints

- UI copy is German. Code identifiers, comments, commit messages are English.
- No upper limit on storylines, sections, time points, characters (BR-001). No pagination limits on the book aggregate.
- The system never changes author data to resolve a contradiction (BR-002). Hints never block saving.
- Validation failures are rejected with HTTP 422 `{ issues: ValidationIssue[] }`; nothing is partially saved.
- Every `/api/books/:bookId/...` route returns 404 when the book does not belong to the session user (never 403, never leak existence).
- Accounts: register, login, logout only. No password reset, no email sending.
- Passwords: min 8 characters, hashed with argon2id (`@node-rs/argon2` defaults).
- Session cookie `sid`: httpOnly, sameSite `lax`, path `/`, 30 days.
- Status values and start status: `in_progress` (default on create), `completed`, `open`.
- Default colors: main strand `#2B59C3`, side strand `#8A94A6`. Status: `in_progress` `#D98E04` symbol `✎`; `completed` `#2E8B57` symbol `✓`; `open` `#7B5EA7` symbol `○`.
- Stroke: main strands 14 px, side strands 6 px (at zoom 1).
- Smooth at 200 storylines; must work beyond. Desktop browsers only.
- Every exported function and every source file has a short doc comment (repo-hygiene).

## Review Focus

1. **Time point reorder that inverts a storyline's range** → author expects a refusal naming the affected storylines/sections, and the order unchanged. Test in Task 7 (`reorder rejects inverting order`) and Task 11 (panel shows issue list).
2. **Another user's ids in the URL** → 404, no data. Test in Task 6 (`foreign book is 404 on every route family`).
3. **Deleting a character referenced by a "Figur wechselt" connection** → connection survives with empty character and a "Figur fehlt" hint. Test in Task 7 (`character delete keeps switch connection`).
4. **Book with no time points** → creating a storyline is impossible; the map shows „Lege zuerst Zeitpunkte an.“ instead of an empty canvas. Test in Task 12 (`empty book shows time point prompt`).
5. **Filter hides one end of a connection** → the connection is drawn as a short stub at the visible storyline, not dropped silently and not crashing. Test in Task 15 (`hidden endpoint renders stub`).

---

## File Structure

```
package.json                 pnpm workspace root, scripts: test, typecheck, lint, dev
pnpm-workspace.yaml
tsconfig.base.json
docker-compose.yml           postgres:16, db bookly + bookly_test
packages/shared/src/
  domain.ts                  domain types (Book aggregate)
  ranges.ts                  range semantics (§6 Semantik)
  validation.ts              validateBook, timePointUsages
  hints.ts                   checkBook, hintKey, staleAcknowledgements, German messages
  schemas.ts                 zod schemas for API request bodies
  index.ts
packages/server/src/
  app.ts                     buildApp(config) -> FastifyInstance
  db/schema.ts               Drizzle tables
  db/client.ts               createDb(url)
  db/loadBook.ts             loadBook(tx, bookId) -> Book
  db/mutate.ts               mutateBook(db, bookId, fn) transaction + validate + ack cleanup
  auth/routes.ts, auth/session.ts
  books/routes.ts            books list/CRUD + aggregate GET
  books/timepoints.ts, books/characters.ts, books/storylines.ts, books/sections.ts,
  books/connections.ts, books/acknowledgements.ts
  test/helpers.ts            test app, test db reset, registered agent
packages/web/src/
  api/client.ts              typed fetch wrapper
  api/hooks.ts               TanStack Query hooks
  auth/LoginPage.tsx, auth/RegisterPage.tsx, auth/RequireAuth.tsx
  books/BookListPage.tsx
  book/BookPage.tsx          map + panels layout
  book/TimePointPanel.tsx, book/CharacterPanel.tsx
  map/layout.ts              assignLanes, x/y geometry
  map/StorylineMap.tsx, map/StorylineBar.tsx, map/ConnectionPath.tsx, map/useZoom.ts
  map/filters.ts             applyFilters
  map/FilterBar.tsx
  storyline/StorylinePanel.tsx, storyline/SectionList.tsx
  connection/ConnectionDialog.tsx, connection/HintList.tsx
e2e/storyline.spec.ts
```

---

### Task 1: Monorepo scaffold and range semantics

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.editorconfig`, `packages/shared/{package.json,tsconfig.json,vitest.config.ts}`, `packages/shared/src/domain.ts`, `packages/shared/src/ranges.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/ranges.test.ts`

**Interfaces:**
- Produces (`domain.ts`):
  ```ts
  export type Id = string; // uuid
  export type StorylineKind = 'main' | 'side';
  export type StorylineStatus = 'in_progress' | 'completed' | 'open';
  export type ConnectionType = 'character_switch' | 'time_jump' | 'merge' | 'flashback';
  export interface TimePoint { id: Id; name: string; position: number }
  export interface Character { id: Id; name: string; description: string | null }
  export interface TimeRange { startId: Id; endId: Id }
  export interface Section { id: Id; storylineId: Id; title: string; description: string; characterIds: Id[]; range: TimeRange; note: string | null; order: number }
  export interface Storyline { id: Id; title: string; description: string; characterIds: Id[]; range: TimeRange; kind: StorylineKind; status: StorylineStatus; color: string; note: string | null; sections: Section[] }
  export interface Connection { id: Id; fromId: Id; toId: Id; type: ConnectionType; label: string | null; characterId: Id | null }
  export type HintRule = 'time_jump_order' | 'merge_no_contact' | 'flashback_order' | 'switch_character_missing' | 'switch_character_not_in_both' | 'character_overlap';
  export interface Acknowledgement { connectionId: Id; rule: HintRule; characterId: Id | null }
  export interface Book { id: Id; title: string; timePoints: TimePoint[]; characters: Character[]; storylines: Storyline[]; connections: Connection[]; acknowledgements: Acknowledgement[] }
  export const STATUS_STYLE: Record<StorylineStatus, { label: string; color: string; symbol: string }>; // values from Global Constraints; labels „in Bearbeitung“, „abgeschlossen“, „bewusst offen“
  export const KIND_DEFAULT_COLOR: Record<StorylineKind, string>;
  ```
- Produces (`ranges.ts`), all using the **index in the position-sorted time point list** (positions may have gaps):
  ```ts
  export type OrderIndex = Map<Id, number>;
  export function orderIndex(timePoints: TimePoint[]): OrderIndex;
  export function bounds(r: TimeRange, idx: OrderIndex): [number, number];
  export function overlaps(a: TimeRange, b: TimeRange, idx: OrderIndex): boolean;   // inclusive, shared endpoint counts
  export function touches(a: TimeRange, b: TimeRange, idx: OrderIndex): boolean;    // overlaps OR neighbouring endpoints
  export function isBefore(a: TimeRange, b: TimeRange, idx: OrderIndex): boolean;   // end(a) < start(b)
  export function contains(outer: TimeRange, inner: TimeRange, idx: OrderIndex): boolean;
  ```

- [ ] **Step 1: Scaffold the workspace.** Root scripts: `test` = `pnpm -r test`, `typecheck` = `pnpm -r typecheck`. TS `strict: true`, `noUncheckedIndexedAccess: true`, ESM. `shared` scripts: `test` = `vitest run`, `typecheck` = `tsc --noEmit`. Run `pnpm install`. Expected: exit 0.
- [ ] **Step 2: Write failing tests** `ranges.test.ts` with time points T0..T4 (positions 10,20,30,40,50 to prove gaps are ignored):
  ```ts
  test('shared endpoint overlaps', () => expect(overlaps(r('T0','T2'), r('T2','T3'), idx)).toBe(true));
  test('disjoint does not overlap', () => expect(overlaps(r('T0','T1'), r('T2','T3'), idx)).toBe(false));
  test('neighbours touch', () => expect(touches(r('T0','T1'), r('T2','T3'), idx)).toBe(true));
  test('gap does not touch', () => expect(touches(r('T0','T0'), r('T2','T3'), idx)).toBe(false));
  test('before is strict', () => { expect(isBefore(r('T0','T1'), r('T2','T2'), idx)).toBe(true); expect(isBefore(r('T0','T2'), r('T2','T3'), idx)).toBe(false); });
  test('contains inclusive', () => expect(contains(r('T0','T4'), r('T0','T4'), idx)).toBe(true));
  test('unsorted input is ordered by position', () => /* pass timePoints shuffled, same results */);
  ```
- [ ] **Step 3: Run** `pnpm --filter shared test`. Expected: FAIL (module not found).
- [ ] **Step 4: Implement** `domain.ts` and `ranges.ts` per Interfaces.
- [ ] **Step 5: Run** `pnpm --filter shared test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(shared): scaffold monorepo and story time range semantics`.

---

### Task 2: Book validation

**Files:**
- Create: `packages/shared/src/validation.ts`
- Test: `packages/shared/src/validation.test.ts`

**Interfaces:**
- Consumes: Task 1 types and range helpers.
- Produces:
  ```ts
  export type ValidationCode = 'range_inverted' | 'unknown_time_point' | 'unknown_character' | 'section_on_side_strand' | 'section_outside_strand' | 'sections_overlap' | 'self_connection' | 'unknown_storyline' | 'empty_title';
  export interface ValidationIssue { code: ValidationCode; elementId: Id; message: string } // German message naming the element title
  export function validateBook(book: Book): ValidationIssue[];
  export interface TimePointUsage { kind: 'storyline' | 'section'; id: Id; title: string }
  export function timePointUsages(book: Book, timePointId: Id): TimePointUsage[];
  ```

Rules (§6): every storyline/section `start ≤ end`; all referenced ids exist in the book; sections only on `kind === 'main'`; each section contained in its strand; sections of one strand may share a boundary point but no other overlap (`sections_overlap` when `end(a) > start(b)` for consecutive sections sorted by start); connection `fromId !== toId`; titles non-empty after trim. `connection.characterId === null` is **valid**.

- [ ] **Step 1: Write failing tests**, one per code, each asserting `validateBook(book).map(i => i.code)` equals exactly `[code]` for a minimal book violating only that rule, plus:
  ```ts
  test('valid book has no issues', () => expect(validateBook(validBook)).toEqual([]));
  test('sections sharing a boundary are fine', ...);           // [T0..T2] + [T2..T4] → []
  test('sections overlapping by a point beyond boundary fail', ...); // [T0..T3] + [T2..T4] → ['sections_overlap']
  test('switch connection without character is valid', ...);
  test('timePointUsages lists storyline and section titles', () => expect(timePointUsages(book,'T2')).toEqual([{kind:'storyline',id:'s1',title:'Annas Flucht'},{kind:'section',id:'x1',title:'Aufbruch'}]));
  ```
- [ ] **Step 2: Run** `pnpm --filter shared test validation`. Expected: FAIL.
- [ ] **Step 3: Implement** `validateBook` and `timePointUsages`.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): validate book aggregates`.

---

### Task 3: Hint engine

**Files:**
- Create: `packages/shared/src/hints.ts`
- Test: `packages/shared/src/hints.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```ts
  export interface Hint { connectionId: Id; rule: HintRule; characterId: Id | null; message: string; acknowledged: boolean }
  export function hintKey(h: { connectionId: Id; rule: HintRule; characterId: Id | null }): string; // `${connectionId}:${rule}:${characterId ?? ''}`
  export function strandCharacters(s: Storyline): Set<Id>;          // storyline ∪ all section characters
  export function checkConnection(book: Book, c: Connection): Hint[];
  export function checkBook(book: Book): Hint[];                     // all connections, acknowledged flag from book.acknowledgements
  export function staleAcknowledgements(book: Book): Acknowledgement[]; // acks with no matching current hint
  ```

Rules (A = from, B = to, §7):
| type | rule | hint when |
|---|---|---|
| time_jump | `time_jump_order` | `start(B) ≤ end(A)` |
| merge | `merge_no_contact` | `!touches(A,B)` |
| flashback | `flashback_order` | `start(B) ≥ start(A)` |
| character_switch | `switch_character_missing` | `characterId === null` |
| character_switch | `switch_character_not_in_both` | character set, not in both `strandCharacters` |
| all except merge | `character_overlap` (one hint per character) | character in both strands and `overlaps(A,B)`; for character_switch skip `c.characterId` |

Messages (exact, `A`/`B` = storyline titles, `F` = character name):
- `time_jump_order`: `Zeitsprung: „B“ beginnt nicht nach dem Ende von „A“.`
- `merge_no_contact`: `Vereinigung: „A“ und „B“ berühren sich zeitlich nicht.`
- `flashback_order`: `Rückblende: „B“ liegt nicht vor dem Beginn von „A“.`
- `switch_character_missing`: `Figur wechselt: Figur fehlt.`
- `switch_character_not_in_both`: `Figur wechselt: „F“ ist nicht in „A“ und „B“ eingetragen.`
- `character_overlap`: `„F“ ist zur selben Zeit in „A“ und „B“ eingetragen.`

- [ ] **Step 1: Write failing tests**: one positive and one negative case per table row (12 tests), plus:
  ```ts
  test('merge suppresses character overlap', ...);
  test('switch exempts only the moving character', ...); // F1 moving + F2 shared → one character_overlap for F2
  test('section characters count for the strand', ...);
  test('acknowledged flag set from acknowledgements', ...);
  test('stale acknowledgement detected after cause fixed', () => expect(staleAcknowledgements(fixedBook)).toEqual([ack]));
  test('messages use exact copy', () => expect(checkConnection(book, jump)[0].message).toBe('Zeitsprung: „Der Prozess“ beginnt nicht nach dem Ende von „Annas Flucht“.'));
  ```
- [ ] **Step 2: Run** `pnpm --filter shared test hints`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces; export everything from `index.ts`.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): compute contradiction hints for connections`.

---

### Task 4: API request schemas

**Files:**
- Create: `packages/shared/src/schemas.ts`
- Test: `packages/shared/src/schemas.test.ts`

**Interfaces:**
- Produces zod schemas + inferred types: `RegisterBody {email, password(min 8), displayName(min 1)}`, `LoginBody {email, password}`, `BookBody {title}`, `TimePointCreateBody {name, afterId: Id | null}` (null = insert first), `TimePointPatchBody {name}`, `ReorderBody {ids: Id[]}`, `CharacterBody {name, description?: string|null}`, `StorylineCreateBody {title, description?='', characterIds?=[], range, kind, status?='in_progress', color?, note?=null}`, `StorylinePatchBody` = partial of create, `SectionCreateBody {title, description?, characterIds?, range, note?}`, `SectionPatchBody` partial, `ConnectionCreateBody {fromId, toId, type, label?=null, characterId?=null}`, `ConnectionPatchBody {type?, label?, characterId?}`, `AcknowledgementBody {connectionId, rule, characterId: Id|null}`. Strings trimmed; titles max 200, description max 2000, note max 10000.

- [ ] **Step 1: Write failing tests**: `StorylineCreateBody.parse` fills `status: 'in_progress'`, `characterIds: []`; rejects `kind: 'x'`; `RegisterBody` rejects 7-char password.
- [ ] **Step 2: Run**, expect FAIL. **Step 3: Implement. Step 4: Run**, expect PASS.
- [ ] **Step 5: Commit** `feat(shared): request body schemas`.

---

### Task 5: Server scaffold, database schema, auth

**Files:**
- Create: `docker-compose.yml`, `packages/server/{package.json,tsconfig.json,vitest.config.ts,drizzle.config.ts}`, `src/app.ts`, `src/index.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/auth/session.ts`, `src/auth/routes.ts`, `src/test/helpers.ts`, `drizzle/` (generated migrations), `.env.example`
- Test: `src/auth/auth.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AppConfig { databaseUrl: string; cookieSecure: boolean }
  export async function buildApp(config: AppConfig): Promise<FastifyInstance>;
  export type Db = ReturnType<typeof createDb>;
  export function createDb(url: string): PostgresJsDatabase<typeof schema>;
  // session.ts: Fastify preHandler that sets request.user or replies 401
  export async function requireUser(request, reply): Promise<void>; // request.user: { id: Id; email: string; displayName: string }
  // test/helpers.ts
  export async function testApp(): Promise<FastifyInstance>;   // truncates all tables in bookly_test
  export async function registeredAgent(app, email?): Promise<{ cookie: string; userId: Id }>;
  ```
- Tables (`schema.ts`, uuid PKs default random, `on delete cascade` from parents): `users(email unique, password_hash, display_name)`, `sessions(id text pk = random 32 bytes base64url, user_id, expires_at)`, `books(user_id, title, created_at)`, `time_points(book_id, name, position int)`, `characters(book_id, name, description null)`, `storylines(book_id, title, description, start_id → time_points restrict, end_id restrict, kind, status, color, note null)`, `sections(storyline_id, title, description, start_id, end_id, note null, order int)`, `storyline_characters(storyline_id, character_id)` pk both, `section_characters(section_id, character_id)` pk both, `connections(book_id, from_id → storylines cascade, to_id cascade, type, label null, character_id → characters set null)`, `acknowledgements(connection_id cascade, rule, character_id null)` unique on `(connection_id, rule, coalesce(character_id))`.
- Routes: `POST /api/auth/register` → 201 `{user}` + cookie, 409 `{error:'email_taken'}`; `POST /api/auth/login` → 200 `{user}` + cookie, 401 `{error:'invalid_credentials'}`; `POST /api/auth/logout` → 204, deletes session; `GET /api/auth/me` → 200 `{user}` | 401. Bodies validated with Task 4 schemas → 400 on parse failure. Emails lowercased.

- [ ] **Step 1:** `docker-compose.yml` with `postgres:16`, port 5432, init script creating `bookly` and `bookly_test`. Run `docker compose up -d`. Expected: healthy.
- [ ] **Step 2: Write failing tests**:
  ```ts
  test('register then me returns user', ...);
  test('duplicate email is 409', ...);              // case-insensitive
  test('wrong password is 401', ...);
  test('logout invalidates session', ...);          // me → 401 afterwards
  test('password is not stored in plain text', ...);
  ```
- [ ] **Step 3: Run** `pnpm --filter server test`. Expected: FAIL.
- [ ] **Step 4: Implement** schema, run `pnpm --filter server drizzle-kit generate`, apply migrations in `testApp()` and at server start; implement auth.
- [ ] **Step 5: Run** tests. Expected: PASS.
- [ ] **Step 6: Commit** `feat(server): database schema and account auth`.

---

### Task 6: Books, aggregate loading, mutation pipeline

**Files:**
- Create: `src/db/loadBook.ts`, `src/db/mutate.ts`, `src/books/routes.ts`
- Test: `src/books/books.test.ts`

**Interfaces:**
- Consumes: Task 2 `validateBook`, Task 3 `checkBook`, `staleAcknowledgements`.
- Produces:
  ```ts
  export interface BookResponse { book: Book; hints: Hint[] }
  export async function loadBook(tx: Db, bookId: Id): Promise<Book>;          // time points sorted by position, sections by order
  export async function mutateBook(db: Db, bookId: Id, change: (tx: Db) => Promise<void>): Promise<BookResponse>;
  // runs change in a transaction, reloads, validateBook → throws ValidationError(issues) (rolls back) if any,
  // deletes staleAcknowledgements, returns {book, hints: checkBook(book)}
  export class ValidationError extends Error { issues: ValidationIssue[] }    // mapped to 422 by app error handler
  export function bookGuard(): preHandler;  // 404 unless :bookId belongs to request.user
  ```
- Routes: `GET /api/books` → `[{id,title,storylineCount}]`; `POST /api/books` → 201 `BookResponse`; `PATCH /api/books/:bookId` → `BookResponse`; `DELETE /api/books/:bookId` → 204; `GET /api/books/:bookId` → `BookResponse`. Child entity ids in URLs must belong to `:bookId`, else 404.

- [ ] **Step 1: Write failing tests**:
  ```ts
  test('create and list books', ...);
  test('new book aggregate is empty', () => expect(res.json().book).toMatchObject({timePoints:[],storylines:[],connections:[]}));
  test('foreign book is 404 on every route family', ...); // user B hits GET/PATCH/DELETE book + one route of each child family (filled in as Tasks 7–9 add them; start with book routes)
  test('mutateBook rolls back on validation issues', ...); // change inserts inverted storyline → ValidationError, nothing persisted
  test('stale acknowledgement removed after mutation', ...);
  ```
- [ ] **Step 2: Run**, expect FAIL. **Step 3: Implement. Step 4: Run**, expect PASS.
- [ ] **Step 5: Commit** `feat(server): books and transactional mutation pipeline`.

---

### Task 7: Time points and characters endpoints

**Files:**
- Create: `src/books/timepoints.ts`, `src/books/characters.ts`
- Test: `src/books/timepoints.test.ts`, `src/books/characters.test.ts`

**Interfaces:**
- Consumes: `mutateBook`, `bookGuard`, `timePointUsages`.
- Routes (all return `BookResponse` unless noted):
  - `POST /api/books/:bookId/timepoints` `TimePointCreateBody` — inserts after `afterId`; positions rewritten as `0..n-1`.
  - `PATCH /api/books/:bookId/timepoints/:id` `TimePointPatchBody`.
  - `PUT /api/books/:bookId/timepoints/order` `ReorderBody` — `ids` must be exactly the book's time point ids (else 400); rewrites positions; 422 via `mutateBook` if any range inverts.
  - `DELETE /api/books/:bookId/timepoints/:id` — 409 `{error:'time_point_in_use', usages: TimePointUsage[]}` if used.
  - `POST/PATCH/DELETE /api/books/:bookId/characters[/:id]` — delete removes from storyline/section joins; `connections.character_id` becomes null via FK.

- [ ] **Step 1: Write failing tests**:
  ```ts
  test('insert after id keeps order', ...);           // [A,C] + insert B after A → names [A,B,C]
  test('reorder rejects inverting order', ...);      // storyline T0..T2, reorder [T2,T1,T0] → 422 with issue code range_inverted and storyline id; GET shows old order
  test('delete used time point is 409 with usages', ...);
  test('delete unused time point', ...);
  test('character delete keeps switch connection', ...); // hints contain switch_character_missing for that connection
  ```
- [ ] **Step 2: Run**, expect FAIL. **Step 3: Implement. Step 4: Run**, expect PASS. Extend the 404 test from Task 6 with one timepoint and one character route.
- [ ] **Step 5: Commit** `feat(server): time point and character endpoints`.

---

### Task 8: Storylines and sections endpoints

**Files:**
- Create: `src/books/storylines.ts`, `src/books/sections.ts`
- Test: `src/books/storylines.test.ts`, `src/books/sections.test.ts`

**Interfaces:**
- Routes (return `BookResponse`):
  - `POST /api/books/:bookId/storylines` `StorylineCreateBody`; `color` defaults to `KIND_DEFAULT_COLOR[kind]`.
  - `PATCH /api/books/:bookId/storylines/:id` `StorylinePatchBody`. When `kind` changes `main → side` and sections exist: append to `note` (separated by a blank line from existing note) one block per section in order:
    ```
    Abschnitt: <title> (<startName> – <endName>)
    <description>
    ```
    then delete the sections, in the same transaction. If `color` was the old kind's default, switch it to the new kind's default.
  - `DELETE /api/books/:bookId/storylines/:id` — cascades sections and connections.
  - `POST /api/books/:bookId/storylines/:id/sections`, `PATCH|DELETE /api/books/:bookId/sections/:sectionId`, `PUT /api/books/:bookId/storylines/:id/sections/order` `ReorderBody`.

- [ ] **Step 1: Write failing tests**:
  ```ts
  test('new storyline starts in_progress with kind default color', ...);
  test('inverted range is 422', ...);
  test('main to side moves sections into note', () => expect(s.note).toBe('Alt\n\nAbschnitt: Aufbruch (Tag 1 – Tag 2)\nAnna verlässt das Dorf.')); // sections: []
  test('section on side strand is 422', ...);
  test('shrinking strand that strands a section is 422', ...);
  test('delete storyline removes its connections', ...);
  ```
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS). Extend the 404 test.
- [ ] **Step 5: Commit** `feat(server): storyline and section endpoints`.

---

### Task 9: Connections and acknowledgements endpoints

**Files:**
- Create: `src/books/connections.ts`, `src/books/acknowledgements.ts`
- Test: `src/books/connections.test.ts`

**Interfaces:**
- Routes (return `BookResponse`): `POST /api/books/:bookId/connections`, `PATCH|DELETE /api/books/:bookId/connections/:id`, `POST /api/books/:bookId/acknowledgements` `AcknowledgementBody` (400 if no matching current hint; idempotent), `DELETE /api/books/:bookId/acknowledgements` same body.

- [ ] **Step 1: Write failing tests**:
  ```ts
  test('contradicting connection is saved and returns hint', ...); // 200, hints[0].rule === 'time_jump_order'
  test('self connection is 422', ...);
  test('acknowledge sets acknowledged flag', ...);
  test('acknowledging non-existent hint is 400', ...);
  test('fixing cause drops acknowledgement; reintroducing shows unacknowledged hint', ...);
  ```
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS). Extend the 404 test; it must now cover books, timepoints, characters, storylines, sections, connections, acknowledgements.
- [ ] **Step 5: Commit** `feat(server): connection and acknowledgement endpoints`.

---

### Task 10: Web scaffold, API client, auth and book list

**Files:**
- Create: `packages/web/{package.json,tsconfig.json,vite.config.ts,index.html,vitest.config.ts}`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/api/client.ts`, `src/api/hooks.ts`, `src/auth/*`, `src/books/BookListPage.tsx`
- Test: `src/auth/LoginPage.test.tsx`, `src/books/BookListPage.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export class ApiError extends Error { status: number; body: unknown }
  export async function api<T>(method: 'GET'|'POST'|'PATCH'|'PUT'|'DELETE', path: string, body?: unknown): Promise<T>; // credentials: 'include'
  export function useMe(): UseQueryResult<User | null>;
  export function useBooks(), useCreateBook(), useBook(bookId): UseQueryResult<BookResponse>;
  export function useBookMutation<B>(method, pathFn: (vars: B) => string): UseMutationResult<BookResponse, ApiError, B>;
  // on success: queryClient.setQueryData(['book', bookId], response)
  ```
- Routes: `/login`, `/register`, `/` (book list, protected), `/books/:bookId` (protected). Vite dev proxy `/api` → `http://localhost:3000`.

- [ ] **Step 1: Write failing tests** (Testing Library + msw): login form posts and navigates to `/`; 401 shows „E-Mail oder Passwort ist falsch.“; book list renders titles and „Neues Buch“ creates one.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(web): auth pages, api client and book list`.

---

### Task 11: Book page with time point and character panels

**Files:**
- Create: `src/book/BookPage.tsx`, `src/book/TimePointPanel.tsx`, `src/book/CharacterPanel.tsx`, `src/book/IssueList.tsx`
- Test: `src/book/TimePointPanel.test.tsx`, `src/book/CharacterPanel.test.tsx`

**Interfaces:**
- Consumes: `useBook`, `useBookMutation`, `validateBook`, `timePointUsages`.
- Produces: `IssueList({ issues: ValidationIssue[] })` reused by later panels. Panels validate a draft locally with `validateBook` before sending; on 422/409 they render the server's issues/usages.
- Time point panel: list in order, inline rename, insert after, drag-to-reorder (native HTML5 DnD), delete. Character panel: add, rename, describe, delete with confirm „Figur „F“ aus allen Storylines entfernen?“.

- [ ] **Step 1: Write failing tests**: reorder that inverts shows `IssueList` with storyline title and does not call the API; deleting used time point shows usages list from 409.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(web): time point and character management`.

---

### Task 12: Storyline map rendering

**Files:**
- Create: `src/map/layout.ts`, `src/map/StorylineMap.tsx`, `src/map/StorylineBar.tsx`
- Test: `src/map/layout.test.ts`, `src/map/StorylineMap.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface LaneLayout { laneOf: Map<Id, number>; laneCount: number; mainLanes: [number, number] } // lane 0 = top
  export function assignLanes(storylines: Storyline[], idx: OrderIndex): LaneLayout;
  export const COLUMN_WIDTH = 160, LANE_HEIGHT = 48, HEADER_HEIGHT = 40;
  export function barGeometry(s: Storyline, lane: number, idx: OrderIndex): { x: number; y: number; width: number };
  ```
  `assignLanes`: greedy interval packing (sorted by start, then longer first) separately for mains and sides; strands sharing a lane must not `overlap`. Mains occupy a contiguous centre block; side lanes alternate above/below it (first side lane above). Deterministic for equal input.
- `StorylineMap({ book, hints, onSelectStoryline, selectedId })`: SVG; header with time point names per column; each bar spans `start` column left edge to `end` column right edge; main stroke 14, side 6; status symbol + status color ring at bar start; sections drawn as segments separated by gaps with section titles when wide enough.

- [ ] **Step 1: Write failing tests**:
  ```ts
  test('mains are in the centre block, sides outside', ...);
  test('overlapping strands never share a lane', ...);
  test('500 storylines lay out under 50 ms', ...);
  test('empty book shows time point prompt', ...);  // text „Lege zuerst Zeitpunkte an.“
  test('bar shows status symbol', ...);             // ✎ for in_progress
  ```
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(web): render storyline map with lanes`.

---

### Task 13: Storyline and section editing

**Files:**
- Create: `src/storyline/StorylinePanel.tsx`, `src/storyline/SectionList.tsx`, `src/storyline/RangePicker.tsx`
- Test: `src/storyline/StorylinePanel.test.tsx`

**Interfaces:**
- Consumes: `IssueList`, storyline/section routes (Task 8).
- Side panel opens on bar click or „Neue Storyline“ (disabled with tooltip when no time points). Also: click-drag across a free lane area in the map selects a range and opens the panel prefilled. Fields per §6; `RangePicker` = two selects of time point names. Kind switch `main → side` with sections asks „Dieser Hauptstrang hat N Abschnitte. Sie werden in die Notiz übernommen und entfernt. Fortfahren?“. Delete asks „Storyline „T“ löschen? N Verbindungen werden ebenfalls entfernt.“. Sections list only for `main`.

- [ ] **Step 1: Write failing tests**: create sends `kind`, `range`, no `status`; kind change dialog text with N=2; delete dialog shows connection count; section form hidden for side strand.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(web): edit storylines and sections`.

---

### Task 14: Connections with instant hints

**Files:**
- Create: `src/map/ConnectionPath.tsx`, `src/connection/ConnectionDialog.tsx`, `src/connection/HintList.tsx`
- Test: `src/connection/ConnectionDialog.test.tsx`, `src/connection/HintList.test.tsx`

**Interfaces:**
- Consumes: `checkConnection`, connection + acknowledgement routes (Task 9).
- Each bar has a handle at its right end; dragging to another bar opens `ConnectionDialog` with type select (labels „Figur wechselt“, „Zeitsprung“, „Handlungsstränge vereinigen sich“, „Rückblende“), character select (only for `character_switch`, options = union of both strands' characters plus all), free text. **While the dialog is open, `checkConnection` runs on every change against a draft book and `HintList` shows the hints before saving** (FR-007). Saving is always allowed.
- `ConnectionPath`: cubic curve from end of A to start of B, type icon at midpoint, label text; warning triangle when an unacknowledged hint exists, muted grey triangle when all acknowledged. Click opens the dialog in edit mode with `HintList` showing „Bewusst so“ / „Wieder anzeigen“ buttons.

- [ ] **Step 1: Write failing tests**: choosing „Zeitsprung“ to an earlier strand shows the exact `time_jump_order` message before save; save button enabled with hints; „Bewusst so“ posts acknowledgement body `{connectionId, rule, characterId}`.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(web): typed connections with live contradiction hints`.

---

### Task 15: Filters, zoom and notes

**Files:**
- Create: `src/map/filters.ts`, `src/map/FilterBar.tsx`, `src/map/useZoom.ts`
- Modify: `src/map/StorylineMap.tsx`, `src/map/ConnectionPath.tsx`
- Test: `src/map/filters.test.ts`, `src/map/StorylineMap.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface MapFilter { mainOnly: boolean; openOnly: boolean; range: TimeRange | null; characterIds: Id[] }
  export function applyFilters(book: Book, f: MapFilter): Set<Id>; // visible storyline ids; criteria AND-combined; range = overlaps; characters = any of (strandCharacters)
  export function useZoom(svgRef): { transform: ZoomTransform; fit(): void }; // d3-zoom, scaleExtent [0.1, 4]
  ```
- `openOnly` means `status === 'open'` („bewusst offen“). Lanes are recomputed for visible storylines only. Connections with one hidden end render a 24 px stub from the visible end, dashed. „Notizen einblenden“ toggle shows note text under bars (truncated to 2 lines, full on hover). Filter state persisted per book in `localStorage` (try/catch).

- [ ] **Step 1: Write failing tests**: each criterion alone and combined; `hidden endpoint renders stub`; notes hidden by default, shown after toggle; fit button resets transform.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(web): filters, zoom and notes overlay`.

---

### Task 16: End-to-end flow and run docs

**Files:**
- Create: `e2e/storyline.spec.ts`, `playwright.config.ts`, `README.md`
- Modify: root `package.json` (scripts `dev` = run server + web concurrently, `e2e`)

- [ ] **Step 1: Write the e2e test**: register → create book „Testbuch“ → add time points „Tag 1“, „Tag 2“, „Tag 3“ → create main „Annas Flucht“ Tag 2–Tag 3 and side „Der Brief“ Tag 1–Tag 1 → connect Annas Flucht → Der Brief as „Zeitsprung“ → expect text `Zeitsprung: „Der Brief“ beginnt nicht nach dem Ende von „Annas Flucht“.` visible before saving → save → warning icon on the connection → „Bewusst so“ → icon muted → reload → still muted.
- [ ] **Step 2: Run** `pnpm e2e`. Expected: FAIL until wiring is complete; fix integration gaps only.
- [ ] **Step 3: Run** `pnpm test && pnpm typecheck && pnpm e2e`. Expected: all PASS.
- [ ] **Step 4:** README: prerequisites (Node 22, pnpm, Docker), `docker compose up -d`, `pnpm install`, `pnpm dev`, test commands, `.env` variables.
- [ ] **Step 5: Commit** `test: end-to-end storyline flow and setup docs`.
