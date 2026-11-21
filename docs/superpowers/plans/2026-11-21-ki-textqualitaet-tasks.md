# KI-Textqualität – Task breakdown (WF-08)

Plan: `2026-11-21-ki-textqualitaet.md`. Spec: `../specs/2026-11-21-ki-textqualitaet-design.md`.
Dependencies: T1 and T2 are independent; T3 depends on T1 (uses the new prompts); T4 depends on T1–T3.

## T1 – Server: natural prose and style voice in style-aware prompts

**Files:** modify `packages/server/src/ai/stylePrompt.ts`, `packages/server/src/ai/structurePrompt.ts`;
create `packages/server/src/ai/stylePrompt.test.ts`; modify `packages/server/src/ai/structurePrompt.test.ts`.

**Interfaces (produces):**
- `export const NATURAL_PROSE: string` – German NFR-001 rule: natural, human-sounding, concrete wording from context,
  varied sentence length/structure and rhythm, no stock phrases („Floskeln“), no repetition, no schematic AI prose
  (e.g. no explaining summaries, no triads of adjectives by habit).
- `export const STYLE_VOICE: string` – German rule: apply `stil` as a recognisable voice (sentence length, rhythm,
  imagery, narrative distance, dialogue); several entries are combined, „Ergänzung des Autors“ refines them; the author's
  `anweisung` takes precedence.
- `draftRequest(ctx)` system = existing sentences + `NATURAL_PROSE` + (`ctx.style` ? `STYLE_VOICE` : nothing).
- `structureRequest(...)` system = existing + one sentence: titles and synopses concrete, without stock phrases, and in the
  tone of `stil` when given.

**Acceptance / checks:**
- `stylePrompt.test.ts`: `styleText` combines only picked presets/team styles + addition (existing behaviour pinned);
  `NATURAL_PROSE` contains „natürlich“, „Floskeln“, „Satzbau“.
- `structurePrompt.test.ts`: draft with style contains `NATURAL_PROSE` and `STYLE_VOICE`; without style contains
  `NATURAL_PROSE`, not `STYLE_VOICE`; index of „vorrangig an die "anweisung"“ < index of `STYLE_VOICE`; `user` JSON equal
  to the pre-change shape (keys `buch … vorherigerText`); structure request system contains „Floskeln“ and `user` still has
  `stil`.
- `npm -w packages/server exec vitest run src/ai` passes; `npm -w packages/server run typecheck` passes.

## T2 – Web: wand icon on „Beschreibung erzeugen“

**Files:** modify `packages/web/src/scene/SceneAssignments.tsx` (button ~line 203), `packages/web/src/scene/SceneAssignments.test.tsx`.

**Change:** add `className="with-icon"` and `<Icon name="wand" />` before the text, import `Icon` from `../ui/Icon`.
Nothing else changes.

**Acceptance / checks:**
- Section form: button found by name „Beschreibung erzeugen“ contains an `svg.icon` (`button.querySelector('svg.icon')`).
- Side strand „Szenen“ tab: same assertion.
- Pending: with a delayed MSW handler the button reads „Erzeuge …“, still has the icon and is disabled; afterwards the
  text lands in the field (existing test pattern).
- Existing tests unchanged and green: `npm -w packages/web exec vitest run src/scene`; web typecheck.

## T3 – Gateway evaluation with synthetic samples

**Files:** create `packages/server/scripts/evalStyles.ts`, `docs/superpowers/evaluations/2026-11-21-ki-textqualitaet.md`.

**Behaviour:** reads `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` from env (`--env-file` of the user's configured .env, never
echoed); builds `draftRequest` for 2 synthetic Bausteine × (7 presets + 2 custom team/addition styles + no style) and
`textRequest` (polish + generate) for 1 synthetic field; writes raw JSON outputs to a job temp dir; the final run's results are committed as a reduced JSON next to the report.
Report records model id, date, script, per-style samples (excerpts) and judgments on naturalness, recognisable style,
context, variation, stock phrases/repetition; labels which text is gateway output and flags limits.

**Acceptance / checks:** script runs (or the blocker is recorded verbatim); report has ≥2 samples per built-in style
and ≥1 per custom style, with judgments; no secrets in repo (`git grep -n "sk-or"` empty).

## T4 – Gate and PR

Commands: `npm ci`; `npm run typecheck`; `TEST_DATABASE_URL=<isolated db> npm test`; `npm -w packages/web run build`.
E2E (`npm run e2e`) only if the environment allows, else reported as not run. Push branch; ready PR against `main`;
handoff to Codex review.
