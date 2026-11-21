# KI-Textqualität in allen Stilen und Zauberstab bei „Beschreibung erzeugen“ – Design (kurz)

Status: approved by the user's handoff (2026-11-21); no RefinIQ qualification requested. This short design records the
approved scope as the implementation basis. It extends `2026-11-20-ki-textfelder-design.md` §6.5
(„Verbindliche Ergänzung für Spookly (NFR-001, 2026-11-21)“), which stays the binding quality rule.

## Intent

Authors pick a style for a work (presets, team base styles, own addition; FR-015..017). The AI text must read like a
person wrote it in that voice: natural German, the selected voice recognisable, concrete wording tied to the context,
varied sentence length and rhythm, no stock phrases, repetition or schematic AI prose. A warm/personal sample with a
concrete scene and its own rhythm was preferred to generically smooth prose. Separately, the scene-assignment button
„Beschreibung erzeugen“ should look like the other AI actions (wand icon plus text, like „Beispielbeschreibung“).

## Goals

1. Every style-aware text generation path carries the NFR-001 quality rules, adapted to what it generates.
2. The selected style stays recognisable and is applied as a voice, not as keywords; precedence (author instruction
   before style), selection scope (only the work's picked presets/team styles/addition), facts and existing action
   behaviour stay unchanged.
3. Manual evaluation with synthetic samples per built-in style and representative custom (team/addition) styles,
   documented with source/model and honest limits.
4. Wand icon plus text on „Beschreibung erzeugen“ in `SceneAssignments.tsx`; label, pending text, handlers unchanged;
   verified for section and side-strand (whole-storyline) targets.

## Non-goals / anti-goals

- No new styles, no UI for styles, no change to style storage, selection or scoping.
- No automatic quality scoring; acceptance stays manual (NFR-001).
- Not presenting authored or Claude-written examples as gateway output.
- Not touching non-style-aware prompts beyond the already approved text-field prompt (e36a6cb).

## Inventory of generation paths on main (fcb5e90)

| Path | File | Style-aware? | Change |
| --- | --- | --- | --- |
| Baustein prose draft | `server/src/ai/structurePrompt.ts` `draftRequest` | yes (`stil`, below `anweisung`) | main target: voice + naturalness rules |
| Chapter structure proposal | `structurePrompt.ts` `structureRequest` | yes (`stil` in user JSON) | style shapes titles/synopses; light naturalness rule, structure rules untouched |
| Text-field wand (rephrase/polish/continue/generate) | `server/src/ai/textPrompt.ts` | no work style; keeps tone of the existing text | e36a6cb rule (natural, concrete, varied, no stock phrases) |
| Scene description / sample | `server/src/ai/scenePrompt.ts` | no | out of scope (not style-aware) |
| Character contradiction check | `server/src/ai/checkPrompt.ts` | no (analysis, not prose) | out of scope |

## Approaches

- **A. Shared quality rule in the prompt module, adapted per path (picked).** One exported German rule text in
  `stylePrompt.ts` next to `styleText`, used by draft and structure system prompts; the draft additionally explains how to
  apply `stil` as a voice (sentence length, rhythm, imagery, distance, dialogue) and that multiple styles are combined.
  Small, testable, reuses the existing module pattern.
- B. Per-preset rewritten descriptions with longer voice guidance. Changes what authors see in the style picker and
  stored meaning; rejected as scope creep.
- C. Post-processing filter for stock phrases. Brittle for German prose, risks changing facts; rejected.

## Design (A)

- `stylePrompt.ts`: export `NATURAL_PROSE` (German rule text, NFR-001 wording) and `STYLE_VOICE` (how to apply `stil`).
- `draftRequest`: system prompt = existing rules + `NATURAL_PROSE` + `STYLE_VOICE` only when a style is set;
  `anweisung` precedence sentence stays first; user payload unchanged.
- `structureRequest`: system prompt gets a short rule that titles/synopses are concrete and in the work's `stil` when
  given, without stock phrases; structure/ID rules unchanged.
- `textPrompt.ts`: keep e36a6cb line.
- Tests pin: the rules are present, style voice rule only with style, precedence order kept, payload unchanged.
- UI: `<Icon name="wand" />` inside the button with `className="with-icon"`; accessible name stays
  „Beschreibung erzeugen“ (icon is `aria-hidden`). Tests assert the icon in section and side-strand use.

## Evaluation

Script under `packages/server/scripts/` builds real requests with the app's own builders for synthetic contexts and
calls the configured OpenRouter gateway (key read from env, never printed). Report in
`docs/superpowers/evaluations/2026-11-21-ki-textqualitaet.md` with model id, per-style samples and judgments; if the
gateway is unavailable this is stated and no samples are presented as gateway output.

## Left to the builder

Exact German wording of the rules, sample contexts, test names.
