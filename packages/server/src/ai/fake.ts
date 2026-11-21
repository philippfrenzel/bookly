/** Deterministic fake AI client used by e2e runs (AI_FAKE=1) and tests. */
import type { AiClient } from './client.js';

/** Returns the id of the first entry of the "characters" array in the JSON user message, if any. */
function firstCharacterId(user: string): string | null {
  try {
    const parsed = JSON.parse(user) as { characters?: { id?: unknown }[] };
    const id = parsed.characters?.[0]?.id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

/** Creates the fake client; a check whose input contains FAKE-WIDERSPRUCH yields one warning. */
export function createFakeAiClient(): AiClient {
  return {
    model: 'fake',
    async complete(req) {
      if (req.schemaName === 'scene_description') {
        const notes = (JSON.parse(req.user) as { notizen?: unknown[] }).notizen?.length ?? 0;
        const image = req.images && req.images.length > 0 ? 'mit Bild' : 'ohne Bild';
        const label = req.system.includes('Beispielpassage') ? 'KI-Beispielpassage' : 'KI-Szenenbeschreibung';
        return { description: `${label} (${notes} Notizen, ${image})` };
      }
      if (req.schemaName === 'structure_proposal') return fakeStructure(req.user);
      if (req.schemaName === 'block_draft') {
        const { baustein } = JSON.parse(req.user) as { baustein: string };
        return { text: `KI-Entwurf: ${baustein}` };
      }
      if (req.schemaName === 'text_suggestions') {
        return { suggestions: ['KI-Vorschlag 1', 'KI-Vorschlag 2', 'KI-Vorschlag 3'] };
      }
      const characterId = req.user.includes('FAKE-WIDERSPRUCH') ? firstCharacterId(req.user) : null;
      if (!characterId) return { warnings: [] };
      return { warnings: [{ characterId, criterion: 'behavior_change', message: 'Fake: Verhalten weicht ab.' }] };
    },
  };
}

interface StructureInput {
  storylines: { id: string; titel: string; abschnitte: { id: string; titel: string; beschreibung: string; szenen: { id: string }[] }[] }[];
  aktuelleStruktur: { chapterId: string; titel: string; bausteine: { blockId: string; titel: string }[] }[];
}

/** Fake structure: one chapter per storyline with a block per section; an existing structure comes back in reverse chapter order. */
function fakeStructure(user: string): unknown {
  const input = JSON.parse(user) as StructureInput;
  if (input.aktuelleStruktur.length > 0) {
    return {
      summary: 'Fake: Kapitel in umgekehrter Reihenfolge.',
      chapters: [...input.aktuelleStruktur].reverse().map((c) => ({
        chapterId: c.chapterId,
        title: c.titel,
        reason: 'Fake: getauscht.',
        blocks: c.bausteine.map((b) => ({ blockId: b.blockId, title: b.titel, synopsis: '', sectionId: null, storylineId: null, sceneIds: [] })),
      })),
    };
  }
  return {
    summary: 'Fake: ein Kapitel pro Storyline.',
    chapters: input.storylines.map((l, i) => ({
      chapterId: null,
      title: `Kapitel ${i + 1}: ${l.titel}`,
      reason: 'Fake: folgt der Storyline.',
      blocks: l.abschnitte.length > 0
        ? l.abschnitte.map((s) => ({ blockId: null, title: s.titel, synopsis: s.beschreibung || s.titel, sectionId: s.id, storylineId: null, sceneIds: s.szenen.map((x) => x.id) }))
        : [{ blockId: null, title: l.titel, synopsis: l.titel, sectionId: null, storylineId: l.id, sceneIds: [] }],
    })),
  };
}
