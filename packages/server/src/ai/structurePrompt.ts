/**
 * Prompt building and answer parsing for the AI chapter structure proposal (FR-001, FR-003, FR-020) and the
 * AI prose draft of one Baustein.
 */
import type { Book, Id, ManuscriptChapter, ProposalChapter, SceneAssignment } from '@bookly/shared';
import { MANUSCRIPT_LIMITS } from '@bookly/shared';
import { AiError, type AiRequest } from './client.js';

/** Scene data the structure prompt may use. */
export interface SceneInfo {
  scenes: { id: Id; name: string }[];
  assignments: SceneAssignment[];
}

const STRUCTURE_SYSTEM = [
  'Du hilfst einer Autorin oder einem Autor, aus Storylines, Figuren und Szenen die Kapitelstruktur eines Romans zu planen.',
  'Ein Kapitel besteht aus Bausteinen. Ein Baustein ist eine szenische Passage: ein Abschnitt einer Storyline an einem Schauplatz.',
  'Ordne die Abschnitte so, dass die Geschichte gut lesbar ist; Haupt- und Nebenstränge dürfen sich abwechseln.',
  'Setze Kapitelgrenzen an sinnvolle Schnitte (Zeitsprung, Ortswechsel, Perspektivwechsel, Spannungsmoment).',
  'Nutze nur IDs aus der Eingabe. Für neue Bausteine ist blockId null, für neue Kapitel chapterId null.',
  'Gibt es bereits eine Struktur ("aktuelleStruktur"), schlage Anpassungen vor: behalte vorhandene Bausteine mit ihrer blockId,',
  'verschiebe sie, wo es der Geschichte hilft, und begründe jede Änderung kurz im Feld reason des Kapitels.',
  'Schreibe Titel, Inhalte (synopsis, 1 bis 3 Sätze) und Begründungen auf Deutsch.',
  'Antworte als JSON-Objekt mit "summary" (ein Satz zum Vorschlag) und "chapters".',
].join(' ');

const nullableId = { type: ['string', 'null'] };

const STRUCTURE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    chapters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          chapterId: nullableId,
          title: { type: 'string' },
          reason: { type: 'string' },
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                blockId: nullableId,
                title: { type: 'string' },
                synopsis: { type: 'string' },
                sectionId: nullableId,
                storylineId: nullableId,
                sceneIds: { type: 'array', items: { type: 'string' } },
              },
              required: ['blockId', 'title', 'synopsis', 'sectionId', 'storylineId', 'sceneIds'],
              additionalProperties: false,
            },
          },
        },
        required: ['chapterId', 'title', 'reason', 'blocks'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'chapters'],
  additionalProperties: false,
};

/** Builds the structure request from the book, its scenes and the current live structure. */
export function structureRequest(book: Book, sceneInfo: SceneInfo, current: ManuscriptChapter[], wish?: string): AiRequest {
  const tpName = new Map(book.timePoints.map((t) => [t.id, t.name]));
  const charName = new Map(book.characters.map((c) => [c.id, c.name ?? 'Unbenannt']));
  const scenesOf = (target: { sectionId?: Id; storylineId?: Id }) =>
    sceneInfo.assignments
      .filter((a) => (target.sectionId ? a.sectionId === target.sectionId : a.storylineId === target.storylineId))
      .map((a) => ({ id: a.sceneId, name: sceneInfo.scenes.find((s) => s.id === a.sceneId)?.name ?? '', beschreibung: a.description }));
  const user = JSON.stringify({
    buch: book.title,
    zeitpunkte: book.timePoints.map((t) => t.name),
    figuren: book.characters.map((c) => ({ name: c.name ?? 'Unbenannt', beschreibung: c.description ?? '' })),
    storylines: book.storylines.map((l) => ({
      id: l.id,
      titel: l.title,
      art: l.kind === 'main' ? 'Hauptstrang' : 'Nebenstrang',
      beschreibung: l.description,
      von: tpName.get(l.range.startId),
      bis: tpName.get(l.range.endId),
      figuren: l.characterIds.map((id) => charName.get(id)),
      szenen: scenesOf({ storylineId: l.id }),
      abschnitte: l.sections.map((s) => ({
        id: s.id,
        titel: s.title,
        beschreibung: s.description,
        von: tpName.get(s.range.startId),
        bis: tpName.get(s.range.endId),
        figuren: s.characterIds.map((id) => charName.get(id)),
        szenen: scenesOf({ sectionId: s.id }),
      })),
    })),
    aktuelleStruktur: current.map((c) => ({
      chapterId: c.id,
      titel: c.title,
      bausteine: c.blocks.map((b) => ({ blockId: b.id, titel: b.title, inhalt: b.synopsis.slice(0, 400) })),
    })),
    ...(wish && { wunsch: wish }),
  });
  return { system: STRUCTURE_SYSTEM, user, schemaName: 'structure_proposal', schema: STRUCTURE_SCHEMA, timeoutMs: 90000 };
}

/** Ids the proposal may reference. */
export interface KnownIds {
  chapters: Set<Id>;
  blocks: Set<Id>;
  sections: Set<Id>;
  storylines: Set<Id>;
  scenes: Set<Id>;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const known = (v: unknown, set: Set<Id>): Id | null => (typeof v === 'string' && set.has(v) ? v : null);

/**
 * Validates the model answer: unknown ids become null (new chapter) or are dropped (blocks and refs), every existing
 * chapter and block appears at most once, empty titles get a fallback. Throws AiError when nothing usable is left.
 */
export function parseStructure(raw: unknown, ids: KnownIds): { summary: string; chapters: ProposalChapter[] } {
  const data = raw as { summary?: unknown; chapters?: unknown } | null;
  if (!data || !Array.isArray(data.chapters)) throw new AiError('AI returned no chapters');
  const seenChapters = new Set<Id>();
  const seenBlocks = new Set<Id>();
  const chapters: ProposalChapter[] = [];
  for (const [i, c] of (data.chapters as Record<string, unknown>[]).entries()) {
    if (!c || typeof c !== 'object') continue;
    let chapterId = known(c.chapterId, ids.chapters);
    if (chapterId && seenChapters.has(chapterId)) chapterId = null;
    if (chapterId) seenChapters.add(chapterId);
    const blocks = (Array.isArray(c.blocks) ? (c.blocks as Record<string, unknown>[]) : []).flatMap((b) => {
      if (!b || typeof b !== 'object') return [];
      const rawBlockId = b.blockId;
      const blockId = known(rawBlockId, ids.blocks);
      if (typeof rawBlockId === 'string' && !blockId) return []; // unknown or deleted block
      if (blockId && seenBlocks.has(blockId)) return [];
      if (blockId) seenBlocks.add(blockId);
      const title = str(b.title, MANUSCRIPT_LIMITS.title);
      if (!blockId && !title) return [];
      return [{
        blockId,
        title: title || 'Baustein',
        synopsis: str(b.synopsis, MANUSCRIPT_LIMITS.synopsis),
        sectionId: known(b.sectionId, ids.sections),
        storylineId: known(b.storylineId, ids.storylines),
        sceneIds: (Array.isArray(b.sceneIds) ? b.sceneIds : []).filter((s): s is Id => typeof s === 'string' && ids.scenes.has(s)),
      }];
    });
    if (blocks.length === 0 && !chapterId) continue;
    chapters.push({ chapterId, title: str(c.title, MANUSCRIPT_LIMITS.title) || `Kapitel ${i + 1}`, reason: str(c.reason, 1000), blocks });
  }
  if (chapters.length === 0) throw new AiError('AI returned no usable chapters');
  return { summary: str(data.summary, 1000), chapters };
}

/** Everything the model may see for the prose draft of one block. */
export interface DraftContext {
  bookTitle: string;
  chapterTitle: string;
  title: string;
  synopsis: string;
  /** Section or storyline the block tells, with its description. */
  source: { title: string; description: string } | null;
  characters: { name: string; description: string }[];
  scenes: { name: string; description: string }[];
  /** End of the previous block's text, for continuity. */
  previousText: string;
}

const DRAFT_SYSTEM = [
  'Du schreibst für eine Autorin oder einen Autor einen ersten Entwurf einer Romanpassage auf Deutsch.',
  'Erzähle, was im Inhalt des Bausteins steht, mit den genannten Figuren am genannten Schauplatz.',
  'Schließe stilistisch und inhaltlich an den vorherigen Text an, falls vorhanden. Etwa 300 bis 600 Wörter.',
  'Kein Titel, keine Erklärungen. Antworte als JSON-Objekt mit dem Feld "text".',
].join(' ');

/** Builds the draft request. */
export function draftRequest(ctx: DraftContext): AiRequest {
  return {
    system: DRAFT_SYSTEM,
    user: JSON.stringify({
      buch: ctx.bookTitle,
      kapitel: ctx.chapterTitle,
      baustein: ctx.title,
      inhalt: ctx.synopsis,
      quelle: ctx.source,
      figuren: ctx.characters,
      szenen: ctx.scenes,
      vorherigerText: ctx.previousText,
    }),
    schemaName: 'block_draft',
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
    timeoutMs: 90000,
  };
}

/** Validates the draft answer. */
export function parseDraft(raw: unknown): string {
  const text = (raw as { text?: unknown } | null)?.text;
  if (typeof text !== 'string' || text.trim() === '') throw new AiError('AI returned no text');
  return text.trim().slice(0, MANUSCRIPT_LIMITS.text);
}
