/** Tests for the word range tab: author save/clear/validation and the reviewer's read-only view. */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { ManuscriptResponse } from '@bookly/shared';
import { REVIEWER_RIGHTS } from '@bookly/shared';
import { meOk } from '../book/testFixtures';
import { renderApp } from '../test/render';
import { server } from '../test/setup';

function manuscript(over: Partial<ManuscriptResponse> = {}, targetWords: { min: number; max: number } | null = null): ManuscriptResponse {
  return {
    book: { id: 'b1', title: 'Sturmland', targetWords },
    role: 'author',
    rights: [...REVIEWER_RIGHTS],
    chapters: [],
    trash: [],
    proposals: [],
    reviewers: [],
    context: { storylines: [], sections: [], scenes: [] },
    style: { presetKeys: [], teamStyleIds: [], addition: '' },
    teamStyles: [],
    ai: { enabled: true },
    ...over,
  };
}

async function openTab() {
  renderApp('/books/b1/manuskript');
  await userEvent.click(await screen.findByRole('tab', { name: 'Umfang' }));
}

describe('LengthPanel', () => {
  it('saves the range with the exact body', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      http.get('/api/books/b1/manuscript', () => HttpResponse.json(manuscript())),
      http.patch('/api/books/b1', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({});
      }),
    );
    await openTab();
    await userEvent.type(screen.getByLabelText('Wörter von'), '50000');
    await userEvent.type(screen.getByLabelText('Wörter bis'), '80000');
    expect(screen.queryByRole('button', { name: 'Entfernen' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByRole('status');
    expect(bodies).toEqual([{ targetWords: { min: 50000, max: 80000 } }]);
  });

  it('clears the stored range with null', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      http.get('/api/books/b1/manuscript', () => HttpResponse.json(manuscript({}, { min: 1000, max: 2000 }))),
      http.patch('/api/books/b1', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({});
      }),
    );
    await openTab();
    expect(screen.getByLabelText('Wörter von')).toHaveValue(1000);
    await userEvent.click(screen.getByRole('button', { name: 'Entfernen' }));
    await screen.findByRole('status');
    expect(bodies).toEqual([{ targetWords: null }]);
  });

  it('rejects min above max and empty input without a request', async () => {
    let calls = 0;
    server.use(
      meOk,
      http.get('/api/books/b1/manuscript', () => HttpResponse.json(manuscript())),
      http.patch('/api/books/b1', () => { calls += 1; return HttpResponse.json({}); }),
    );
    await openTab();
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bitte ganze Zahlen zwischen 1 und 2.000.000 eingeben.');
    await userEvent.type(screen.getByLabelText('Wörter von'), '900');
    await userEvent.type(screen.getByLabelText('Wörter bis'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Von darf nicht größer als bis sein.');
    expect(calls).toBe(0);
  });

  it('shows reviewers the range read-only', async () => {
    server.use(meOk, http.get('/api/books/b1/manuscript', () => HttpResponse.json(manuscript({ role: 'reviewer', rights: ['read'] }, { min: 50000, max: 80000 }))));
    await openTab();
    expect(screen.getByText('Etwa 50.000–80.000 Wörter')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Speichern' })).not.toBeInTheDocument();
  });

  it('tells reviewers when no range is set', async () => {
    server.use(meOk, http.get('/api/books/b1/manuscript', () => HttpResponse.json(manuscript({ role: 'reviewer', rights: ['read'] }))));
    await openTab();
    expect(screen.getByText('Kein Zielumfang festgelegt.')).toBeInTheDocument();
  });
});
