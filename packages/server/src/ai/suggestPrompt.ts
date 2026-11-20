/** Builds suggestion requests (base profile or per-storyline addition) and parses replies. */
import { SuggestionResult, type Suggestion, type SuggestionBody } from '@bookly/shared';
import { AiError, type AiRequest } from './client.js';

/** Context for a suggestion; with `storyline` only storyline-specific differences are requested. */
export interface SuggestContext {
  character: SuggestionBody;
  storyline?: { title: string; description: string; note: string; sections: { title: string; description: string }[] };
}

const BASE = `Du hilfst Autorinnen und Autoren beim Entwickeln von Figuren.
Aus dem Namen und der Beschreibung der Figur schlägst du ein Verhaltensmuster (wie die Figur typischerweise handelt) und ihre Absichten (was sie erreichen will) vor.
Antworte auf Deutsch, knapp (1–3 Sätze je Feld), ohne die Beschreibung zu wiederholen.`;

const ADDITION = `${BASE}
Du bekommst zusätzlich eine Storyline. Schlage nur vor, was sich für die Figur in dieser Storyline vom Grundprofil unterscheidet. Ist das Grundprofil ausreichend, lasse das Feld leer.`;

/** Builds the structured-output request for a suggestion. */
export function suggestRequest(ctx: SuggestContext): AiRequest {
  return {
    system: ctx.storyline ? ADDITION : BASE,
    user: JSON.stringify(ctx.storyline ? { character: ctx.character, storyline: ctx.storyline } : { character: ctx.character }),
    schemaName: 'character_suggestion',
    timeoutMs: 30_000,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['behavior', 'intentions'],
      properties: { behavior: { type: 'string' }, intentions: { type: 'string' } },
    },
  };
}

/** Longest suggested field; matches the 2000-character limit of the character fields. */
const MAX_FIELD = 2000;

/**
 * Validates the model reply and trims each field and clamps it to 2000 characters, so applying a
 * suggestion always passes validation; throws AiError('invalid_response') on a wrong shape.
 */
export function parseSuggestion(raw: unknown): Suggestion {
  const parsed = SuggestionResult.safeParse(raw);
  if (!parsed.success) throw new AiError('invalid_response');
  const clamp = (s: string) => s.trim().slice(0, MAX_FIELD).trim();
  return { behavior: clamp(parsed.data.behavior), intentions: clamp(parsed.data.intentions) };
}
