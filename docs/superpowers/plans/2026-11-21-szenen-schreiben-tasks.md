# Szenen schreiben – Task breakdown (WF-08)

Basis: `docs/superpowers/specs/2026-11-21-szenen-schreiben-design.md` · Plan: `docs/superpowers/plans/2026-11-21-szenen-schreiben.md` · Branch `codex/spookly-scene-writing`, task-start `fcb5e90178e8b7d2e85467f83e9f1e05a5349403`. No RefinIQ qualification requested.

| # | Task | Depends on | Acceptance | Validation |
|---|---|---|---|---|
| T1 | Shared contracts (blocks, word range, length, `sceneBlock` wand target) | – | A1, A2, A3 (types/validation) | `npm -w packages/shared test`, typecheck |
| T2 | Server persistence: migration `0008`, book range PATCH, blocks PUT with revision, legacy PATCH/POST | T1 | A1 persist/read, A2 migration/order/atomicity/concurrency, both targets | server tests `sceneBlocks.test.ts`, `books.test.ts`; full server suite |
| T3 | Server AI: scoped scene-block context, length guidance in wand/draft/structure, readers truncate scene text | T1, T2 | A1 composing-time length, never per-scene quota, unset = old prompt; A3 server-derived context, 404 for foreign ids | `sceneBlockContext.test.ts`, `lengthGuidance.test.ts`, `aiRoutes.test.ts`, `structurePrompt.test.ts` |
| T4 | Web: „Umfang“ panel, length select on „KI-Entwurf“ | T1, T2, T3 | A1 edit/read in UI | `LengthPanel.test.tsx`, `ManuscriptPage.test.tsx` |
| T5 | Web: block editor (split at caret, insert, undo split, remove empty, per-block wand, 409 handling) | T1, T2, T3 | A2 UI, A3 selection/active block only, Undo/cancel kept | `blockOps.test.ts`, `SceneBlocks.test.tsx`, existing `SceneAssignments.test.tsx`, `MagicWand.test.tsx` |
| T6 | E2E full example, configurable e2e ports, README, gates | T1–T5 | A4 | `e2e/scene-writing.spec.ts` + full e2e on isolated DB/ports; `npm run typecheck`; `npm test` |

Gate (no `scripts/post_development.py` in this repo): `npm run typecheck`, `TEST_DATABASE_URL=postgres://localhost:5432/bookly_test_spookly_scene npm test`, `E2E_DATABASE_URL=postgres://localhost:5432/bookly_e2e_spookly_scene E2E_API_PORT=3130 E2E_WEB_PORT=5194 npm run e2e`.
