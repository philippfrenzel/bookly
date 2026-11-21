# KI-Textqualität und Zauberstab bei „Beschreibung erzeugen“ Implementation Plan (WF-07)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every style-aware AI text path asks for natural, human German in a recognisable selected voice, and the
scene-assignment button „Beschreibung erzeugen“ shows the wand icon.

**Architecture:** Shared German rule texts live in `packages/server/src/ai/stylePrompt.ts` (next to `styleText`) and are
appended to the system prompts of `draftRequest` and `structureRequest`; the text-field prompt keeps its e36a6cb rule.
The web button reuses `Icon name="wand"` with `className="with-icon"` as in `ScenePanel.tsx`. A gateway evaluation
script uses the app's own request builders on synthetic contexts.

**Tech Stack:** TypeScript, Fastify, Vitest, React + Testing Library + MSW, OpenRouter (existing `createOpenRouterClient`).

**Spec:** `docs/superpowers/specs/2026-11-21-ki-textqualitaet-design.md` (extends
`docs/superpowers/specs/2026-11-20-ki-textfelder-design.md` §6.5 NFR-001 addition, cherry-picked from e36a6cb).

**Task breakdown (WF-08):** `docs/superpowers/plans/2026-11-21-ki-textqualitaet-tasks.md`.

Task start / base SHA: `fcb5e90178e8b7d2e85467f83e9f1e05a5349403` (main). Branch: `codex/spookly-ai-text-quality`.

## Global Constraints

- UI German, code and docs English; prompt texts German.
- Precedence in the draft: `anweisung` of the author before `stil` — unchanged.
- Style scope unchanged: only `styleText(style, teamStyles)` of the work (picked presets, picked team styles, addition).
- No change to request payloads (`user` JSON), schemas, timeouts, parsing or routes.
- No fact invention rule stays in every prompt that has it.
- Button: label „Beschreibung erzeugen“, pending „Erzeuge …“, disabled/blocker logic and `generate.mutate` handler unchanged.
- Evaluation: synthetic data only, API key never printed or committed, gateway output marked as such.

## Review Focus

- Work without any style: draft must not get the voice rule mentioning `stil` (no phantom style) — test in Task 1.
- Work with several presets plus team style plus addition: voice rule says combine them, addition is the author's — test in Task 1 (rule text).
- Author instruction conflicting with style: precedence sentence still precedes style sentences — test in Task 1.
- Side strand (whole storyline target) uses the same button: icon present there too — test in Task 2.
- Pending state: button text switches to „Erzeuge …“ while icon stays and accessible name follows — test in Task 2.

## Tasks (summary; details in the task breakdown)

1. Server prompt rules: `NATURAL_PROSE`, `STYLE_VOICE` in `stylePrompt.ts`; wire into `draftRequest` (always naturalness,
   voice only with style) and `structureRequest` (concrete titles/synopses, in `stil` when given); unit tests in new
   `packages/server/src/ai/stylePrompt.test.ts` and extended `structurePrompt.test.ts`.
2. Web wand icon on „Beschreibung erzeugen“ in `SceneAssignments.tsx`; tests in `SceneAssignments.test.tsx` for section
   and side-strand targets and pending state.
3. Gateway evaluation: `packages/server/scripts/evalStyles.ts` (synthetic contexts, all 7 presets, 2 custom styles, no
   style baseline, text-field actions) and the report `docs/superpowers/evaluations/2026-11-21-ki-textqualitaet.md`.
4. Gate: `npm run typecheck`, `npm test` (isolated `TEST_DATABASE_URL`), `npm run -w packages/web build`; PR.
