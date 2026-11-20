/** Builds the character-check model input, its request and parses the model reply. */
import { createHash } from 'node:crypto';
import { CHARACTER_CRITERIA, CRITERIA_VERSION, characterLabel, type Book, type CharacterCriterion, type Id } from '@bookly/shared';
import { AiError, type AiRequest } from './client.js';

/** Everything the model sees for one storyline. */
export interface CheckInput {
  storyline: { title: string; description: string; note: string };
  sections: { title: string; description: string; note: string; characterIds: Id[] }[];
  characters: {
    id: Id;
    label: string;
    description: string;
    behavior: string;
    intentions: string;
    addition: { behavior: string; intentions: string } | null;
  }[];
}

/** A validated warning returned by the model. */
export interface ParsedWarning { characterId: Id; criterion: CharacterCriterion; message: string }

/** Collects the check input of a storyline; null when it is missing or has no characters. */
export function buildCheckInput(book: Book, storylineId: Id): CheckInput | null {
  const storyline = book.storylines.find((s) => s.id === storylineId);
  if (!storyline) return null;
  const sections = [...storyline.sections].sort((a, b) => a.order - b.order);
  const ids = [...new Set([...storyline.characterIds, ...sections.flatMap((s) => s.characterIds)])];
  const characters = ids.flatMap((id) => {
    const c = book.characters.find((ch) => ch.id === id);
    if (!c) return [];
    const add = storyline.additions.find((a) => a.characterId === id);
    return [{
      id, label: characterLabel(c), description: c.description ?? '', behavior: c.behavior ?? '', intentions: c.intentions ?? '',
      addition: add ? { behavior: add.behavior ?? '', intentions: add.intentions ?? '' } : null,
    }];
  });
  if (characters.length === 0) return null;
  return {
    storyline: { title: storyline.title, description: storyline.description, note: storyline.note ?? '' },
    sections: sections.map((s) => ({ title: s.title, description: s.description, note: s.note ?? '', characterIds: s.characterIds })),
    characters,
  };
}

/** Fingerprint of the model input, criteria version and model name. */
export function inputHash(input: CheckInput, model: string): string {
  return createHash('sha256').update(JSON.stringify({ input, model, v: CRITERIA_VERSION })).digest('hex');
}

const SYSTEM = `Du bist ein Lektor und prüfst die Figuren einer Storyline auf Widersprüche.
Du bekommst als JSON die Storyline mit ihren Abschnitten und die beteiligten Figuren mit Beschreibung, Verhaltensmuster und Absichten. Manche Figuren haben eine Ergänzung für diese Storyline.

Prüfkriterien:
${CHARACTER_CRITERIA.map((c) => `- ${c.key}: ${c.description}`).join('\n')}

Regeln:
- Grundprofil + Ergänzung gilt: Eine Ergänzung erweitert oder überschreibt das Grundprofil innerhalb dieser Storyline.
- Beziehungen stehen in den Beschreibungen der Figuren.
- Melde nur echte Widersprüche, keine Stilkritik und keine Vermutungen.
- message: 1–2 Sätze auf Deutsch, nenne die Stelle (Storyline oder Abschnitt), an der der Widerspruch auftritt.
- Gibt es keine Widersprüche, antworte mit einer leeren Liste.`;

/** Builds the structured-output request for a check. */
export function checkRequest(input: CheckInput): AiRequest {
  return {
    system: SYSTEM,
    user: JSON.stringify(input),
    schemaName: 'character_check',
    timeoutMs: 60_000,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['warnings'],
      properties: {
        warnings: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['characterId', 'criterion', 'message'],
            properties: {
              characterId: { type: 'string', enum: input.characters.map((c) => c.id) },
              criterion: { type: 'string', enum: CHARACTER_CRITERIA.map((c) => c.key) },
              message: { type: 'string' },
            },
          },
        },
      },
    },
  };
}

/** Validates the model reply; drops unknown characters and criteria, throws on a wrong shape. */
export function parseCheckResponse(raw: unknown, input: CheckInput): ParsedWarning[] {
  const warnings = (raw as { warnings?: unknown } | null)?.warnings;
  if (!Array.isArray(warnings)) throw new AiError('invalid_response');
  const ids = new Set(input.characters.map((c) => c.id));
  const keys = new Set<string>(CHARACTER_CRITERIA.map((c) => c.key));
  const out: ParsedWarning[] = [];
  for (const w of warnings) {
    const { characterId, criterion, message } = (w ?? {}) as Record<string, unknown>;
    if (typeof characterId !== 'string' || typeof criterion !== 'string' || typeof message !== 'string') throw new AiError('invalid_response');
    if (!ids.has(characterId) || !keys.has(criterion)) continue;
    out.push({ characterId, criterion: criterion as CharacterCriterion, message: message.trim().slice(0, 1000) });
  }
  return out;
}
