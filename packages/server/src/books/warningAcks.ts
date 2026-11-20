/** Keeps character warning acknowledgements in step with the character links of a storyline. */
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Id } from '@bookly/shared';
import type { Tx } from '../db/loadBook.js';
import { characterWarningAcks, sectionCharacters, sections, storylineCharacters } from '../db/schema.js';

/**
 * Deletes the storyline's acks for those of `candidateIds` that are no longer linked to it, neither
 * directly nor through one of its sections. Call after the links were changed.
 */
export async function pruneUnlinkedAcks(tx: Tx, storylineId: Id, candidateIds: Id[]): Promise<void> {
  const candidates = [...new Set(candidateIds)];
  if (candidates.length === 0) return;
  const direct = tx
    .select({ id: storylineCharacters.characterId })
    .from(storylineCharacters)
    .where(eq(storylineCharacters.storylineId, storylineId));
  const viaSection = tx
    .select({ id: sectionCharacters.characterId })
    .from(sectionCharacters)
    .innerJoin(sections, eq(sections.id, sectionCharacters.sectionId))
    .where(eq(sections.storylineId, storylineId));
  await tx.delete(characterWarningAcks).where(
    and(
      eq(characterWarningAcks.storylineId, storylineId),
      inArray(characterWarningAcks.characterId, candidates),
      notInArray(characterWarningAcks.characterId, sql`(${direct} UNION ${viaSection})`),
    ),
  );
}
