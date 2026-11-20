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
      if (req.schemaName === 'character_suggestion') {
        return { behavior: 'Vorschlag Verhalten', intentions: 'Vorschlag Absichten' };
      }
      const characterId = req.user.includes('FAKE-WIDERSPRUCH') ? firstCharacterId(req.user) : null;
      if (!characterId) return { warnings: [] };
      return { warnings: [{ characterId, criterion: 'behavior_change', message: 'Fake: Verhalten weicht ab.' }] };
    },
  };
}
