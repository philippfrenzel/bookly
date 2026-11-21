/** Pure prompt building and answer parsing for the AI scene description (spec 2026-11-21-szenen-design.md §4.3). */
import { SCENE_AI_NOTE_BUDGET, SCENE_LIMITS } from '@bookly/shared';
import { AiError, type AiImage, type AiRequest } from './client.js';

/** Everything the model may see for one scene description. */
export interface SceneDescriptionContext {
  bookTitle: string;
  sceneName: string;
  /** Non-blank notes in order. */
  notes: string[];
  image: AiImage | null;
  /** The section the description is meant for, when given. */
  section: { title: string; description: string; storylineTitle: string } | null;
}

/** Notes actually sent and what the budget left out; used for the request and the trace log line. */
export interface NoteSelection {
  notes: string[];
  chars: number;
  omitted: number;
}

const SYSTEM = [
  'Du hilfst einer Autorin oder einem Autor, die Schauplätze eines Buches zu beschreiben.',
  'Schreibe auf Deutsch eine kurze Szenenbeschreibung (2 bis 5 Sätze) des Ortes und seiner Atmosphäre.',
  'Nutze das Bild und die Notizen der Szene als Referenz, soweit vorhanden. Erfinde nichts, was ihnen widerspricht.',
  'Beschreibe den Ort, keine Handlung, keine Dialoge. Kein Titel, keine Anführungszeichen, keine Erklärungen.',
  'Antworte als JSON-Objekt mit dem Feld "description".',
].join(' ');

const SCHEMA = {
  type: 'object',
  properties: { description: { type: 'string' } },
  required: ['description'],
  additionalProperties: false,
};

/** Keeps notes in order until the character budget is reached; blank notes are dropped. */
export function selectNotes(notes: string[], budget = SCENE_AI_NOTE_BUDGET): NoteSelection {
  const kept: string[] = [];
  let chars = 0;
  const filled = notes.map((n) => n.trim()).filter((n) => n !== '');
  for (const n of filled) {
    if (chars + n.length > budget) break;
    kept.push(n);
    chars += n.length;
  }
  return { notes: kept, chars, omitted: filled.length - kept.length };
}

/** Builds the structured-output request; the image, if any, travels as an image part (FR-004). */
export function sceneDescriptionRequest(ctx: SceneDescriptionContext): AiRequest {
  const user = JSON.stringify({
    buch: ctx.bookTitle,
    szene: ctx.sceneName,
    notizen: ctx.notes,
    bild: ctx.image ? 'siehe angehängtes Bild' : 'kein Bild',
    ...(ctx.section && {
      abschnitt: { titel: ctx.section.title, beschreibung: ctx.section.description, storyline: ctx.section.storylineTitle },
    }),
  });
  return {
    system: SYSTEM,
    user,
    schemaName: 'scene_description',
    schema: SCHEMA,
    timeoutMs: 30000,
    ...(ctx.image && { images: [ctx.image] }),
  };
}

/** Validates the model answer and trims it to the description limit; throws AiError when unusable. */
export function parseSceneDescription(raw: unknown): string {
  const value = (raw as { description?: unknown } | null)?.description;
  if (typeof value !== 'string' || value.trim() === '') throw new AiError('AI returned no description');
  return value.trim().slice(0, SCENE_LIMITS.description).trim();
}
