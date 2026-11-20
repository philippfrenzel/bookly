/** Tests for the „Figuren“ group of the hint list: counting, acknowledging, folding, checking. */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { CharacterWarning } from '@bookly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render';
import { server } from '../test/setup';
import { bookOk, bookResponse, meOk, sampleBook } from './testFixtures';

const open: CharacterWarning = {
  id: 'w1', storylineId: 's1', characterId: 'c1', criterion: 'behavior_change',
  message: 'Mira handelt plötzlich feige.', acknowledged: false,
};
const folded: CharacterWarning = { ...open, id: 'w2', characterId: 'c2', criterion: 'intention_conflict', message: 'Jon will zwei Dinge.', acknowledged: true };

afterEach(() => vi.restoreAllMocks());

describe('BookHints – Figuren', () => {
  it('counts open character warnings in the badge and shows title, figure and criterion', async () => {
    server.use(meOk, bookOk(sampleBook(), { characterWarnings: [open, folded] }));
    renderApp('/books/b1');
    const region = await screen.findByRole('region', { name: 'Hinweise im Buch' });
    expect(within(region).getByRole('heading', { name: 'Figuren' })).toBeInTheDocument();
    expect(within(region).getByText('Hauptstrang · Mira · Verhalten weicht ab')).toBeInTheDocument();
    expect(within(region).getByText('Mira handelt plötzlich feige.')).toBeInTheDocument();
    expect(region.querySelector('h2 .count-badge')).toHaveTextContent('1');
  });

  it('confirms with the character name and posts the acknowledgement', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(sampleBook(), { characterWarnings: [open] }),
      http.post('/api/books/b1/character-warning-acks', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(sampleBook(), { characterWarnings: [{ ...open, acknowledged: true }] }));
      }),
    );
    renderApp('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Bewusst so' }));
    expect(confirm).toHaveBeenCalledWith('Auch künftige Hinweise dieser Art für Mira in dieser Storyline werden gedämpft.');
    expect(bodies).toEqual([{ storylineId: 's1', characterId: 'c1', criterion: 'behavior_change' }]);
    expect(await screen.findByText('1 bewusst so belassen')).toBeInTheDocument();
  });

  it('does not post when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(sampleBook(), { characterWarnings: [open] }),
      http.post('/api/books/b1/character-warning-acks', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(sampleBook()));
      }),
    );
    renderApp('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Bewusst so' }));
    expect(bodies).toEqual([]);
  });

  it('folds acknowledged warnings into the details and lets them be shown again', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(sampleBook(), { characterWarnings: [folded] }),
      http.delete('/api/books/b1/character-warning-acks', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(sampleBook(), { characterWarnings: [{ ...folded, acknowledged: false }] }));
      }),
    );
    renderApp('/books/b1');
    const summary = await screen.findByText('1 bewusst so belassen');
    expect(summary.closest('details')).toContainElement(screen.getByText('Jon will zwei Dinge.'));
    await userEvent.click(screen.getByRole('button', { name: 'Wieder anzeigen', hidden: true }));
    expect(bodies).toEqual([{ storylineId: 's1', characterId: 'c2', criterion: 'intention_conflict' }]);
    expect(await screen.findByRole('button', { name: 'Bewusst so' })).toBeInTheDocument();
  });

  it('opens the storyline when the item is clicked', async () => {
    server.use(meOk, bookOk(sampleBook(), { characterWarnings: [open] }));
    renderApp('/books/b1');
    await userEvent.click(await screen.findByText('Mira handelt plötzlich feige.'));
    expect(await screen.findByRole('tab', { name: 'Storyline', selected: true })).toBeInTheDocument();
  });

  it('posts a full check with „Alle prüfen“', async () => {
    let calls = 0;
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.post('/api/books/b1/character-checks', () => {
        calls += 1;
        return HttpResponse.json(bookResponse(sampleBook()));
      }),
    );
    renderApp('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Alle prüfen' }));
    expect(calls).toBe(1);
  });

  it('disables „Alle prüfen“ when the AI is off', async () => {
    server.use(meOk, bookOk(sampleBook(), { ai: { enabled: false } }));
    renderApp('/books/b1');
    expect(await screen.findByRole('button', { name: 'Alle prüfen' })).toBeDisabled();
  });
});
