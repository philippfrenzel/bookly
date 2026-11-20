# KI-Zauberstab für Textfelder – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every content text field in Bookly gets a magic-wand menu (Umformulieren, Fortsetzen, Stil verbessern, or Vorschlagen when the field is empty). It returns up to 3 AI suggestions, inserts the first in place, lets the user switch between them and supports undo. It replaces the old character suggestion box and the automatic suggestions.

**Architecture:** `shared` defines the request body, the field limits and pure insertion helpers (`targetRange`, `fitSuggestion`, `draftHasText`). Server and web both use them. `server` gets a context builder (Variant B: the field plus the object it belongs to and its direct neighbourhood), a prompt and parser, and one route `POST /api/books/:bookId/ai/text` on the existing OpenRouter client. `web` gets one `MagicWand` component that attaches to any `<input>`/`<textarea>` through a getter. It is wired into `TextInput` (storylines, sections) and into the character, addition and connection fields.

**Tech Stack:** existing (TypeScript, zod, Fastify 5, Drizzle, React 18 + TanStack Query 5, Vitest + Testing Library + msw, Playwright). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-20-ki-textfelder-design.md` (German). Read it before any task; §-numbers below refer to it.

## Global Constraints

- UI copy is German, and code, comments and commits are English. Every exported function and source file gets a short doc comment (repo-hygiene).
- **Field limits:** titles 200, descriptions and character/addition fields 2000, notes 10000, connection label 200. Titles, the character name and the connection label are single-line.
- **Menu labels:** `Umformulieren`, `Fortsetzen`, `Stil verbessern`, `Vorschlagen` (the only item when the field is empty).
- **Messages:** `Vorschlag fehlgeschlagen.`, `Kein Vorschlag.`, `Markierung zu kurz.`, `Erst Titel oder Beschreibung eingeben.` (storyline/section), `Erst Name oder Beschreibung eingeben.` (character), disabled title `KI nicht eingerichtet`.
- **Numbers:** exactly 3 suggestions requested. The selection must be at least 3 non-space characters. „Fortsetzen“ is disabled with fewer than 20 free characters. AI timeout is 20 000 ms.
- **Keys:** Escape, ✕ and ↶ restore the original text. A click outside, typing or leaving the field keeps the shown suggestion. Alt+← and Alt+→ switch suggestions. In the connection dialog, Escape with the bar open closes only the bar.
- **Saving:** the wand never saves anything itself. Saving goes through the field's existing path: blur in edit forms, the live draft in create forms, „Speichern“ in the dialog.
- **AI off:** the wand is shown disabled. The route answers 503 `{ error: 'ai_disabled' }` (existing `requireAi`). AI failure gives 502 `{ error: 'ai_failed' }`.
- **Tests never call the network.** Server tests inject a fake `AiClient`, web tests use msw, e2e runs with `AI_FAKE=1` (already set in `playwright.config.ts`).
- **No wand inside a `<label>`:** fields that get a wand use the `div.field > span + control[aria-label]` pattern already used by `SectionList`.

## Review Focus

1. **Clicking the wand with the mouse must not lose the selection or blur the field.** Otherwise the selection is gone and edit forms save mid-flow. → Task 6 test `keeps the selection when the wand is clicked`.
2. **Escape in the connection dialog** must close only the suggestion bar, not the modal. → Task 8 test `Escape closes the bar but not the dialog`.
3. **A reply that arrives after the user typed, or after the field unmounted,** must be dropped silently. → Task 6 tests `drops a reply when the text changed meanwhile` and `ignores a reply after unmount`.
4. **Edit-form save semantics:** Escape followed by blur saves nothing. Keeping suggestion 2 followed by blur sends exactly one PATCH with that text. A create form (`live`) receives the inserted text in its draft. → Task 7 tests `no PATCH after Escape`, `one PATCH with the kept suggestion`, `create draft receives inserted text`.
5. **A suggestion that would overflow the field or add line breaks to a single-line field** must be clamped and flattened before insertion. → Task 1 tests on `fitSuggestion`.

---

### Task 1: Shared request body, limits and insertion helpers

**Files:**
- Create: `packages/shared/src/aiText.ts`, `packages/shared/src/aiText.test.ts`
- Modify: `packages/shared/src/index.ts` (export `./aiText.js`)

**Interfaces — Produces:**
- `type AiTextAction = 'rephrase' | 'continue' | 'polish' | 'generate'`
- `AiTextTarget` (zod discriminated union on `kind`, each with `field`):
  - `{ kind: 'storyline'; storylineId: Id | null; field: 'title' | 'description' | 'note' }`
  - `{ kind: 'section'; storylineId: Id; sectionId: Id | null; field: 'title' | 'description' | 'note' }`
  - `{ kind: 'character'; characterId: Id; field: 'name' | 'description' | 'behavior' | 'intentions' }`
  - `{ kind: 'addition'; storylineId: Id; characterId: Id; field: 'behavior' | 'intentions' }`
  - `{ kind: 'connection'; fromId: Id; toId: Id; type: ConnectionType; characterId: Id | null; field: 'label' }`
- `AiTextDraft` (zod): optional `title`, `description`, `note`, `name`, `behavior`, `intentions` (strings, max 10000), and `characterIds?: Id[]`. Default `{}`.
- `AiTextBody` (zod): `{ target: AiTextTarget; action: AiTextAction; text: string (max 10000); selection: { start: number; end: number } | null; draft: AiTextDraft }`, with a `superRefine` that enforces these rules:
  - `text.length` is at most `fieldLimit(target).max`.
  - A selection satisfies `0 ≤ start < end ≤ text.length`, and its trimmed text is at least 3 characters (`MIN_SELECTION = 3`).
  - `generate` requires `text.trim() === ''` and `selection === null`.
  - Every other action requires `text.trim() !== ''`.
- `AiTextResult` (zod): `{ suggestions: string[] }`
- `fieldLimit(target: AiTextTarget): { max: number; singleLine: boolean }`, using the Global Constraints values.
- `targetRange(action, text, selection): { start: number; end: number }`:
  - `generate` → `[0, 0]`.
  - `continue` → `[selection.end, selection.end]`, or `[text.length, text.length]` without a selection.
  - `rephrase` and `polish` → the selection, or `[0, text.length]` without one.
- `fitSuggestion(suggestion, text, range, limit, action): string`:
  - trims the suggestion and replaces newlines with single spaces when `limit.singleLine`;
  - for `continue` at a position > 0 whose previous character is not whitespace, prefixes `' '` unless the suggestion starts with whitespace or one of `.,;:!?)`;
  - clamps to `limit.max - (text.length - (range.end - range.start))` and trims again.
- `draftHasText(target, draft): boolean`. It is true when the owning object has any non-empty text besides `target.field`:
  - storyline: `title`, `description`, `note`, or a non-empty `characterIds`;
  - character: `name`, `description`, `behavior`, `intentions`;
  - always true for `section`, `addition` and `connection`, because their parent always has a title.
- `MIN_SELECTION = 3`, `MIN_CONTINUE_ROOM = 20`.

- [ ] **Step 1: Write failing tests in `aiText.test.ts`:**
  - `AiTextBody` rejects these bodies: a selection `{start:2,end:1}`; a selection past `text.length`; a selection of `'  a '`; `generate` with text `'x'`; `rephrase` with text `'  '`; a storyline title text of 201 chars; a `connection` target with `field: 'title'`.
  - It accepts `{ target: {kind:'storyline', storylineId:null, field:'description'}, action:'generate', text:'', selection:null, draft:{ title:'Flucht' } }`.
  - `targetRange('continue','abc',null)` → `{start:3,end:3}`. `targetRange('rephrase','abc def',{start:4,end:7})` → `{start:4,end:7}`. `targetRange('polish','abc',null)` → `{start:0,end:3}`.
  - `fitSuggestion('weiter.', 'Mira geht', {start:9,end:9}, {max:2000,singleLine:false}, 'continue')` → `' weiter.'`. With `', dann'` it returns `', dann'`.
  - `fitSuggestion('a\nb', '', {start:0,end:0}, {max:200,singleLine:true}, 'generate')` → `'a b'`.
  - Text of 195 chars, range `{start:0,end:5}`, suggestion of 50 chars, `max:200` → result length 10.
  - `draftHasText({kind:'storyline',storylineId:null,field:'title'}, {})` → false. With `{characterIds:[uuid]}` → true. A character target with `field:'name'` and draft `{ name: 'Jon' }` → false (only the field itself has text).
- [ ] **Step 2:** `npm -w packages/shared test` → FAIL (module missing).
- [ ] **Step 3:** Implement `aiText.ts`. Reuse the `ConnType` enum values from `schemas.ts`: export the enum from there or redeclare `['character_switch','time_jump','merge','flashback']`.
- [ ] **Step 4:** `npm -w packages/shared test` → PASS.
- [ ] **Step 5:** Commit `feat(shared): AI text request body and insertion helpers`.

### Task 2: Server context builder

**Files:**
- Create: `packages/server/src/ai/textContext.ts`, `packages/server/src/ai/textContext.test.ts`

**Interfaces:**
- Consumes: `AiTextBody`, `AiTextDraft`, `draftHasText` (Task 1), `Book` from shared, `NotFoundError` from `../errors.js`.
- Produces:
  - `interface TextContext { fieldLabel: string; context: Record<string, unknown>; hasText: boolean }`
  - `buildTextContext(book: Book, body: AiTextBody): TextContext`. It throws `NotFoundError` when an id in `target` is not part of `book`, and also when an `addition` target's character is not linked to the storyline.
- `fieldLabel` (German): title → `Titel`, description → `Kurzbeschreibung` (storyline/section) or `Beschreibung` (character), note → `Notiz`, name → `Name`, behavior → `Verhalten`, intentions → `Absichten`, label → `Beschriftung`.
- `context` content per §6.3 (JSON-ready, German keys are fine). Draft values win over stored ones (`draft[k] !== undefined`).
  - **storyline:** `buch` (book title) and `storyline` (`titel`, `beschreibung`, `notiz`, `art`, `status`, `zeitraum: "Start – Ende"` from time-point names, `abschnitte: [{titel, beschreibung}]` ordered by `order`). It also adds `figuren: [{name, beschreibung}]` from `draft.characterIds ?? storyline.characterIds`. With `storylineId: null` it uses only the draft and `figuren`.
  - **section:** the storyline context of its parent, plus `abschnitt` (`titel`, `beschreibung`, `notiz`, `zeitraum`, `figuren`), `vorher` and `nachher` (`{titel, beschreibung}` or null). With `sectionId: null`, `vorher` is the last existing section and `nachher` is null.
  - **character:** `buch` and `figur` (`name`, `beschreibung`, `verhalten`, `absichten`), plus `storylines` (titles of the storylines whose `characterIds` include the character).
  - **addition:** `grundprofil` (the character's four fields), `storyline` (`titel`, `beschreibung`, `notiz`, `abschnitte`) and `ergaenzung` (`verhalten`, `absichten` from draft or stored addition). It also sets `hinweis: 'Nur Abweichungen vom Grundprofil beschreiben.'`.
  - **connection:** `typ` (German label, as in `CONNECTION_TYPES` in `ConnectionDialog.tsx`; duplicate the 4 labels here), `von` and `nach` (`{titel, beschreibung}` of the storylines), and `figur` (name) when `characterId` is set.
- `hasText` = `draftHasText(target, mergedDraft)`, where `mergedDraft` is the stored values of the owning object overlaid with `body.draft`.

- [ ] **Step 1: Write failing tests in `textContext.test.ts`.** Build a plain `Book` object; no DB is needed.
  - `merges draft over stored storyline fields`: stored description `'alt'` and draft `{ description: 'neu' }` give `context.storyline.beschreibung === 'neu'`.
  - `new storyline uses only the draft`: `storylineId: null` and draft `{ title: 'Flucht', characterIds: [annaId] }` give `figuren[0].name === 'Anna'` and `hasText === true`.
  - `new storyline without text has no context text`: empty draft and empty `characterIds` give `hasText === false`.
  - `section has neighbours`: the middle of three sections gives `vorher.titel` and `nachher.titel` of its neighbours. A new section (`sectionId: null`) gets `vorher` = the last section and `nachher === null`.
  - `character lists its storylines`.
  - `addition requires a linked character`: throws `NotFoundError`.
  - `foreign ids throw NotFoundError` for each kind.
  - `fieldLabel` is `'Kurzbeschreibung'` for a storyline description and `'Beschreibung'` for a character description.
- [ ] **Step 2:** `npm -w packages/server test -- textContext` → FAIL.
- [ ] **Step 3:** Implement `buildTextContext`.
- [ ] **Step 4:** `npm -w packages/server test -- textContext` → PASS.
- [ ] **Step 5:** Commit `feat(server): build AI text context from the book`.

### Task 3: Server prompt, parser and fake client

**Files:**
- Create: `packages/server/src/ai/textPrompt.ts`, `packages/server/src/ai/textPrompt.test.ts`
- Modify: `packages/server/src/ai/fake.ts`

**Interfaces:**
- Consumes: `TextContext` (Task 2), `AiTextBody`, `AiTextResult`, `fieldLimit`, `targetRange`, `fitSuggestion` (Task 1), `AiRequest` and `AiError` (`client.ts`).
- Produces:
  - `TEXT_SCHEMA_NAME = 'text_suggestions'`
  - `textRequest(ctx: TextContext, body: AiTextBody): AiRequest` with `timeoutMs: 20_000`, a JSON schema `{ type:'object', additionalProperties:false, required:['suggestions'], properties:{ suggestions:{ type:'array', items:{ type:'string' } } } }`, and a `user` message that is the JSON of `{ feld: ctx.fieldLabel, aktion, text, markierung: <selected text or null>, kontext: ctx.context }`.
  - `parseTextSuggestions(raw: unknown, body: AiTextBody): string[]`. A wrong shape throws `AiError('invalid_response')`. Otherwise it maps each entry through `fitSuggestion(s, body.text, targetRange(...), fieldLimit(body.target), body.action)`, drops empty results and duplicates, and keeps at most 3.
- System prompt: one shared base (§6.5 rules, copied as German instructions) plus one line per action.
  - **rephrase:** rewrite the target passage in other words, keeping its meaning.
  - **polish:** improve the style; keep content, tense and perspective.
  - **continue:** write only the new text that follows at the insertion point, 1–3 sentences.
  - **generate:** write the field's text from the context; 1–3 sentences, or at most ~8 words for `Titel`, `Name` and `Beschriftung`.
  - **All actions:** exactly 3 clearly different variants; output only the replacement text.
- `fake.ts`: for `req.schemaName === 'text_suggestions'` return `{ suggestions: ['KI-Vorschlag 1', 'KI-Vorschlag 2', 'KI-Vorschlag 3'] }`. Keep the existing branches for now; Task 4 removes `character_suggestion`.

- [ ] **Step 1: Write failing tests in `textPrompt.test.ts`:**
  - `textRequest` uses `schemaName 'text_suggestions'` and `timeoutMs 20000`. For a `continue` body, the system prompt contains `Fortsetz` (word stem). The user JSON has `markierung` equal to the selected substring, or null without a selection.
  - `parseTextSuggestions({ suggestions: [' a ', 'a', '', 'b', 'c', 'd'] }, rephraseBody)` → `['a','b','c']`.
  - `parseTextSuggestions({ text: 'x' }, body)` throws `AiError`.
  - For a storyline title body (`max 200`, single-line), `'Zeile\nzwei'` becomes `'Zeile zwei'`.
- [ ] **Step 2:** `npm -w packages/server test -- textPrompt` → FAIL.
- [ ] **Step 3:** Implement `textPrompt.ts` and the fake branch.
- [ ] **Step 4:** `npm -w packages/server test -- textPrompt` → PASS.
- [ ] **Step 5:** Commit `feat(server): AI text prompt and parser`.

### Task 4: Route `POST /api/books/:bookId/ai/text`, old suggestion routes removed

**Files:**
- Modify: `packages/server/src/books/aiRoutes.ts`, `packages/server/src/books/aiRoutes.test.ts`, `packages/server/src/ai/fake.ts` (drop the `character_suggestion` branch)
- Delete: `packages/server/src/ai/suggestPrompt.ts`, `packages/server/src/ai/suggestPrompt.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `POST /api/books/:bookId/ai/text` with preHandlers `requireUser`, `bookGuard()` and `requireAi`. Body `AiTextBody`, reply `AiTextResult`.
  - 400 `{ error: 'invalid_body', details }` for an invalid body.
  - 400 `{ error: 'empty_context' }` when `action === 'generate'` and `!ctx.hasText`.
  - 404 for foreign ids (from `buildTextContext`).
  - 502 `{ error: 'ai_failed' }` on any `complete` or parse failure (log as today, with the message `ai text suggestion failed`).
- Removed: both `/suggestion` routes, `mergeDraft`, `findCharacter` (if unused), and the `suggest` helper.

- [ ] **Step 1: Replace the `describe('suggestions')` block with `describe('ai text')` tests,** using the existing `setup()` helper:
  - `returns three fake suggestions for a storyline description` → status 200, `{ suggestions: ['KI-Vorschlag 1','KI-Vorschlag 2','KI-Vorschlag 3'] }`.
  - `generate on an empty new storyline returns 400 empty_context`.
  - `invalid selection returns 400 invalid_body`.
  - `foreign storyline id returns 404`: a storyline id from a second book.
  - `ai failure returns 502 ai_failed`: a client whose `complete` throws `AiError`.
  - `addition for an unlinked character returns 404`.
  - In the `AI off` test, replace the two suggestion paths with `/ai/text` and a valid body, and expect 503.
- [ ] **Step 2:** `npm -w packages/server test -- aiRoutes` → FAIL.
- [ ] **Step 3:** Implement the route and delete the old code.
- [ ] **Step 4:** `npm -w packages/server test` and `npm -w packages/server run typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(server): one AI text route replaces character suggestions`.

### Task 5: Web helpers for menu state and in-place replacement

**Files:**
- Create: `packages/web/src/ai/wandState.ts`, `packages/web/src/ai/wandState.test.ts`, `packages/web/src/ai/replaceRange.ts`, `packages/web/src/ai/replaceRange.test.ts`

**Interfaces:**
- Consumes: `AiTextAction`, `AiTextTarget`, `MIN_SELECTION`, `MIN_CONTINUE_ROOM` and `fieldLimit` (Task 1).
- Produces:
  - `interface MenuItem { action: AiTextAction; label: string; disabled: boolean }`
  - `menuItems(input: { text: string; selection: { start: number; end: number } | null; target: AiTextTarget; contextHasText: boolean }): { items: MenuItem[]; hint: string | null }`
    - **empty text:** only `Vorschlagen` (`generate`). It is disabled with the hint `Erst Titel oder Beschreibung eingeben.` (storyline/section) or `Erst Name oder Beschreibung eingeben.` (character) when `!contextHasText`.
    - **otherwise:** `Umformulieren`, `Fortsetzen` and `Stil verbessern`. With a selection shorter than `MIN_SELECTION` after trimming, all three are disabled with the hint `Markierung zu kurz.`. `Fortsetzen` is disabled when `max - text.length < MIN_CONTINUE_ROOM`.
  - `replaceRange(el: HTMLInputElement | HTMLTextAreaElement, start: number, end: number, value: string): void`:
    1. Focus `el`, then call `el.setSelectionRange(start, end)`.
    2. Try `document.execCommand('insertText', false, value)` (this keeps the browser undo stack).
    3. If that returns false or `el.value` did not change as expected (jsdom), set the value through the prototype's native `value` setter (`Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set`) and dispatch `new Event('input', { bubbles: true })`, so React `onChange` fires.
    4. Finally, select the inserted text: `setSelectionRange(start, start + value.length)`.

- [ ] **Step 1: Write failing tests:**
  - `wandState.test.ts`:
    - an empty text gives the single item `Vorschlagen`;
    - an empty text with `contextHasText false` on a storyline gives a disabled item and the storyline hint;
    - a selection of 2 chars gives all items disabled and `Markierung zu kurz.`;
    - a storyline title of 185 chars gives `Fortsetzen` disabled and `Umformulieren` enabled.
  - `replaceRange.test.ts`: render a controlled `<textarea>` with React `useState`, call `replaceRange(el, 5, 9, 'neu')` on `'Mira ging weg'`, and expect state and value `'Mira neu weg'` and `selectionStart 5`, `selectionEnd 8`.
- [ ] **Step 2:** `npm -w packages/web test -- wandState replaceRange` → FAIL.
- [ ] **Step 3:** Implement both modules.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(web): magic wand menu state and range replacement`.

### Task 6: `MagicWand` component

**Files:**
- Create: `packages/web/src/ai/MagicWand.tsx`, `packages/web/src/ai/MagicWand.test.tsx`
- Modify: `packages/web/src/ui/Icon.tsx` (add `wand`, `prev`, `next`, `undo` and `close` paths in the same 16px / 1.75 stroke style), `packages/web/src/styles.css` (`.wand-field`, `.wand-button`, `.wand-menu`, `.wand-bar`, following `packages/web/DESIGN.md`)

**Interfaces:**
- Consumes: Task 5 helpers, `api` and `ApiError` (`api/client.ts`), `AiTextBody`, `AiTextResult`, `AiTextTarget` and `AiTextDraft` (Task 1).
- Produces:
  ```ts
  interface MagicWandProps {
    getField: () => HTMLInputElement | HTMLTextAreaElement | null;
    bookId: Id;
    target: AiTextTarget;
    /** Values of the owning object's other fields (unsaved ones included); omitted → {}. */
    draft?: () => AiTextDraft;
    enabled: boolean;      // BookResponse.ai.enabled
    fieldLabel: string;    // used in aria-labels
  }
  export function MagicWand(props: MagicWandProps): JSX.Element
  ```
  The caller places the field and `<MagicWand>` inside one `<div className="wand-field">`.
- **Accessible names:**
  - wand button: `KI-Assistent: {fieldLabel}`;
  - menu: `role="menu"` with `role="menuitem"` buttons carrying the labels above;
  - bar buttons: `Vorheriger Vorschlag`, `Nächster Vorschlag`, `Rückgängig`, `Vorschläge schließen`;
  - counter: plain text `1/3`;
  - messages: `role="status"`.
- **Behaviour (§6.2):**
  - **Opening the menu:** the wand button and every bar button call `preventDefault()` on `mousedown`, so the field keeps focus and selection. On click, the wand reads `el.selectionStart` and `el.selectionEnd` (equal values → `null`) and opens the menu built by `menuItems`, with `contextHasText = draftHasText(target, draft?.() ?? {})` (`draftHasText` already ignores the field itself). The menu works with the arrow keys, Enter and Escape.
  - **Sending:** an action POSTs `/api/books/${bookId}/ai/text` with `{ target, action, text: el.value, selection, draft: draft?.() ?? {} }`. It snapshots `el.value`, and the wand is disabled while loading.
  - **Reply:** the reply is dropped if `el.value !== snapshot` or the component unmounted. Otherwise each suggestion is passed through `fitSuggestion`, and if none is left the message is `Kein Vorschlag.`. Then `replaceRange` inserts suggestion 1 into `targetRange(...)`, and the component remembers `{ original, start, currentLength, index, suggestions }` and shows the bar.
  - **Switching:** ◀ ▶ and Alt+←/→ on the field replace `[start, start + currentLength]` with the other suggestion; the index wraps around.
  - **Restoring:** ↶, ✕ and Escape (on the field or the bar) call `replaceRange(el, 0, el.value.length, original)`, close the bar and call `stopPropagation()` on the key event.
  - **Closing and keeping:** the bar closes and keeps the text on an `input` event the wand did not cause (use a guard ref around its own `replaceRange` calls), on a `mousedown` outside the `.wand-field`, and on `focusout` whose `relatedTarget` is outside the `.wand-field`.
  - **Errors:** a failure shows `Vorschlag fehlgeschlagen.` and leaves the field unchanged. `enabled=false` renders the wand disabled with the title `KI nicht eingerichtet`.

- [ ] **Step 1: Write failing tests in `MagicWand.test.tsx`.** The harness is an uncontrolled `<textarea aria-label="Feld">` plus `<MagicWand>` with a storyline description target. msw `POST /api/books/b1/ai/text` returns `{ suggestions: ['A1','A2','A3'] }` and records the bodies.
  - `rephrases the whole text without a selection`: value `'Mira geht.'`, open the wand, choose `Umformulieren` → value `'A1'`, request `selection: null`, bar shows `1/3`.
  - `keeps the selection when the wand is clicked`: `setSelectionRange(5, 9)` on `'Mira geht weg'`, then `userEvent.click` the wand and choose `Umformulieren` → request `selection {start:5,end:9}`, value `'Mira A1 weg'`.
  - `switches suggestions`: `Nächster Vorschlag` twice → `'Mira A3 weg'` and `3/3`; `Vorheriger Vorschlag` → `'Mira A2 weg'` and `2/3`.
  - `undo restores the original` (↶) and `Escape restores the original`, and the bar is gone in both cases.
  - `typing keeps the suggestion and closes the bar`.
  - `continue appends with a space`: `'Mira geht'` + `Fortsetzen` → `'Mira geht A1'`.
  - `empty field offers only Vorschlagen`, and `disabled when draft has no text` with the hint `Erst Titel oder Beschreibung eingeben.`.
  - `drops a reply when the text changed meanwhile`: a delayed msw response; type a letter before it resolves → value unchanged by the wand, no bar.
  - `ignores a reply after unmount`: no React warning or exception.
  - `shows Vorschlag fehlgeschlagen. on 502`.
  - `disabled with title KI nicht eingerichtet when enabled is false`.
- [ ] **Step 2:** `npm -w packages/web test -- MagicWand` → FAIL.
- [ ] **Step 3:** Implement `MagicWand.tsx`, the icons and the CSS.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(web): MagicWand component`.

### Task 7: Storylines and sections get the wand; `suggestTick` removed

**Files:**
- Modify: `packages/web/src/storyline/fields.tsx`, `packages/web/src/storyline/StorylinePanel.tsx`, `packages/web/src/storyline/SectionList.tsx`, `packages/web/src/storyline/CharacterChecks.tsx`, `packages/web/src/storyline/AdditionEditor.tsx` (drop only the `suggestTick` prop and effect here), `packages/web/src/storyline/StorylinePanel.test.tsx`

**Interfaces:**
- Consumes: `MagicWand` (Task 6).
- Produces: a new optional `TextInput` prop `ai?: { bookId: Id; target: AiTextTarget; draft?: () => AiTextDraft; enabled: boolean }`.
  - With `ai`, `TextInput` holds a ref to its control and renders `<div className="wand-field">{control}<MagicWand getField={() => ref.current} fieldLabel={ariaLabel ?? ''} {...ai} /></div>`.
  - Without `ai`, it renders exactly as today.
  - The inserted text reaches `onChange` through the `input` event that `replaceRange` dispatches. Live forms commit it at once; edit forms commit it on blur.
- `StorylinePanel`:
  - Titel, Kurzbeschreibung and Notiz switch from `<label>` wrappers to `<div className="field"><span>…</span><TextInput ariaLabel="…" …/></div>`.
  - They pass `ai={{ bookId: book.id, target: { kind:'storyline', storylineId: storyline?.id ?? null, field }, draft: () => ({ title: v.title, description: v.description, note: v.note, characterIds: v.characterIds }), enabled: aiEnabled }}`.
  - Remove `suggestTick` and its setter calls.
- `SectionList`:
  - `SectionFields` gets `aiEnabled`, `storylineId` and `sectionId: Id | null` props and passes `ai` with `{ kind:'section', storylineId, sectionId, field }`.
  - Draft = the section values (`title`, `description`, `note`, `characterIds`).
  - `SectionList` receives `aiEnabled` from `StorylinePanel`.
- `CharacterChecks` and `AdditionEditor`: remove the `suggestTick` prop and the effect that requested suggestions.

- [ ] **Step 1: Write failing tests in `StorylinePanel.test.tsx`.** Use msw for `/ai/text` and the PATCH route, and remove the test `requests a suggestion for an expanded editor after a description change`.
  - `edit description: kept suggestion is saved once on blur`: choose `Umformulieren`, then `Nächster Vorschlag`, then tab away → exactly one PATCH with `{ description: 'A2' }`.
  - `no PATCH after Escape`: wand, then `Umformulieren`, then Escape, then tab away → zero PATCH requests.
  - `create draft receives inserted text`: in create mode, enter title `'Flucht'`, use the wand on the empty description and choose `Vorschlagen`, then click `Anlegen` → the POST body has `description: 'A1'`.
  - `section title has a wand`: the button `KI-Assistent: Titel {section title}` exists.
  - `wand disabled when AI is off`.
- [ ] **Step 2:** `npm -w packages/web test -- StorylinePanel` → FAIL.
- [ ] **Step 3:** Implement the changes. Existing tests that query `getByLabelText('Titel')` and similar keep working through `ariaLabel`; fix any that relied on the `<label>` wrapper.
- [ ] **Step 4:** `npm -w packages/web test` and `npm -w packages/web run typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(web): magic wand on storyline and section fields`.

### Task 8: Characters, additions and connections get the wand; old suggestion UI removed

**Files:**
- Modify: `packages/web/src/book/CharacterPanel.tsx`, `packages/web/src/book/CharacterPanel.test.tsx`, `packages/web/src/storyline/AdditionEditor.tsx`, `packages/web/src/connection/ConnectionDialog.tsx`, `packages/web/src/connection/ConnectionDialog.test.tsx`, `packages/web/src/book/BookPage.tsx` (pass `aiEnabled` to `ConnectionDialog`), `packages/shared/src/schemas.ts` (remove `SuggestionBody`, `SuggestionResult`, `Suggestion`)
- Delete: `packages/web/src/character/SuggestionBox.tsx`, `packages/web/src/character/useSuggestion.ts`

**Interfaces:**
- Consumes: `MagicWand` (Task 6).
- **`CharacterItem`:** each of name, description, behavior and intentions is wrapped in `.wand-field` with `<MagicWand getField={() => areas.current[field]} target={{ kind:'character', characterId: c.id, field }} draft={() => current values of the four fields from the refs} …/>`. Keep the existing `onBlur` save and drop the auto-request on description blur. Remove the `Vorschlagen` button, the error line and the `SuggestionBox`. The name `<input>` needs a ref like the textareas.
- **`AdditionEditor`:** both textareas move out of `<label>` into `div.field` + `span` (their `aria-label` stays) and get a `MagicWand` with `{ kind:'addition', storylineId, characterId: c.id, field }` and draft `{ behavior, intentions }` from the refs. Remove the `Vorschlagen` button and `SuggestionBox`.
- **`ConnectionDialog`:** new prop `aiEnabled: boolean`. The label input moves out of `<label>` into `div.field` + `span` (`Beschriftung`, `aria-label="Beschriftung"`) and gets a `MagicWand` with `{ kind:'connection', fromId, toId, type, characterId: type === 'character_switch' ? characterId : null, field:'label' }`. The modal's Escape handler stays; the wand stops propagation while its bar is open (Task 6).

- [ ] **Step 1: Write failing tests:**
  - `CharacterPanel.test.tsx`:
    - delete the `Vorschlagen`, `Übernehmen`, `Verwerfen` and auto-suggestion tests;
    - add `no request on description blur`: msw records zero `/ai/text` and `/suggestion` calls after changing and blurring the description;
    - add `wand on Verhalten inserts and saves on blur`: wand `KI-Assistent: Verhalten Figur Jon`, then `Vorschlagen`, then tab away → PATCH `{ behavior: 'A1' }`;
    - add `wand disabled when AI is off`.
  - `ConnectionDialog.test.tsx`:
    - `label wand sends the connection target`: the request body has `target.kind 'connection'`, `fromId` and `toId`;
    - `Escape closes the bar but not the dialog`: after inserting, press Escape → the label is restored, the dialog is still in the document, `onClose` was not called; a second Escape calls `onClose`.
- [ ] **Step 2:** `npm -w packages/web test -- CharacterPanel ConnectionDialog` → FAIL.
- [ ] **Step 3:** Implement the changes, delete the files and remove the shared schemas.
- [ ] **Step 4:** `npm test` and `npm run typecheck` (repo root, all workspaces) → PASS. `grep -rn "SuggestionBox\|useSuggestion\|suggestTick\|/suggestion" packages` → no matches.
- [ ] **Step 5:** Commit `feat(web): magic wand on character, addition and connection fields`.

### Task 9: End-to-end flow

**Files:**
- Create: `e2e/magic-wand.spec.ts`

**Interfaces:**
- Consumes: the whole feature; the fake suggestions `KI-Vorschlag 1..3` (Task 3).

- [ ] **Step 1: Write the e2e test `magic wand on a storyline description`.** Register, create a book and two time points as in `e2e/characters.spec.ts` (copy its setup steps), then create a storyline with the title `Flucht` and save it with `Anlegen`. Then:
  1. Fill the description with `Mira geht.` and blur it.
  2. Click `KI-Assistent: Kurzbeschreibung` and choose `Umformulieren`. Expect the description value `KI-Vorschlag 1`.
  3. Click `Nächster Vorschlag` → `KI-Vorschlag 2`. Click the Titel field → the bar is gone.
  4. Reload the page and open the storyline → the description is `KI-Vorschlag 2` (saved on blur).
  5. Select `Vorschlag 2` in the description (`setSelectionRange` via `evaluate`), click the wand, choose `Stil verbessern` and press Escape → the value is still `KI-Vorschlag 2`.
- [ ] **Step 2:** `npm run e2e -- magic-wand` → PASS. This needs the e2e database from `playwright.config.ts`. If it is not available locally, say so in the hand-off instead of skipping silently.
- [ ] **Step 3:** Commit `test(e2e): magic wand flow`.
