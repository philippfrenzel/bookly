/** Tests for assembling the full book response including AI warnings. */
import { describe, expect, test } from 'vitest';
import { registeredAgent, testApp } from '../test/helpers.js';
import { seedCharacter, seedStoryline, seedTimePoints } from '../test/fixtures.js';
import { bookResponse } from './bookResponse.js';
import { loadBook } from './loadBook.js';
import { characterWarningAcks, characterWarnings } from './schema.js';

describe('bookResponse', () => {
  test('marks warnings acknowledged by ack key and reports ai flag', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const created = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Roman' } });
    const bookId: string = created.json().book.id;
    const [t0, , t2] = await seedTimePoints(app, bookId);
    const storylineId = await seedStoryline(app, bookId, t0!, t2!);
    const characterId = await seedCharacter(app, bookId);
    await app.db.insert(characterWarnings).values([
      { storylineId, characterId, criterion: 'behavior_change', message: 'Weicht ab.' },
      { storylineId, characterId, criterion: 'intention_conflict', message: 'Widerspruch.' },
    ]);
    await app.db.insert(characterWarningAcks).values({ storylineId, characterId, criterion: 'behavior_change' });

    const res = await bookResponse(app.db, await loadBook(app.db, bookId), true);
    const byCriterion = Object.fromEntries(res.characterWarnings.map((w) => [w.criterion, w]));
    expect(byCriterion.behavior_change).toMatchObject({ storylineId, characterId, acknowledged: true });
    expect(byCriterion.intention_conflict?.acknowledged).toBe(false);
    expect(res.characterChecks).toEqual([]);
    expect(res.ai).toEqual({ enabled: true });
    expect(res.hints).toEqual([]);
    await app.close();
  });
});
