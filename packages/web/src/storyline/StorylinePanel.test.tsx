/** Tests for storyline and section editing in the side panel. */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Book, Section } from '@bookly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookOk, meOk, sampleBook } from '../book/testFixtures';
import { renderApp } from '../test/render';
import { server } from '../test/setup';

function section(id: string, order: number, s: string, e: string): Section {
  return { id, storylineId: 's1', title: `Teil ${order + 1}`, description: '', characterIds: [], range: { startId: s, endId: e }, note: null, order };
}

/** Sample book whose main strand has two sections and one connection to a side strand. */
function richBook(): Book {
  const book = sampleBook();
  book.storylines[0]!.sections = [section('x1', 0, 't1', 't1'), section('x2', 1, 't2', 't2')];
  book.storylines.push({
    id: 's2', title: 'Rivale', description: '', characterIds: [], range: { startId: 't1', endId: 't3' },
    kind: 'side', status: 'open', color: '#8A94A6', note: null, sections: [],
  });
  book.connections = [{ id: 'k1', fromId: 's1', toId: 's2', type: 'time_jump', label: null, characterId: null }];
  return book;
}

afterEach(() => vi.restoreAllMocks());

async function openStoryline(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Storyline „${name}“` }));
}

describe('StorylinePanel', () => {
  it('creates a storyline with kind and range but without status', async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.post('/api/books/b1/storylines', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ book: sampleBook(), hints: [] }, { status: 201 });
      }),
    );
    renderApp('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Neue Storyline' }));
    await userEvent.type(screen.getByLabelText('Titel'), 'Rivale');
    await userEvent.click(screen.getByRole('radio', { name: 'Nebenstrang' }));
    await userEvent.selectOptions(screen.getByLabelText('Zeitraum Start'), 't2');
    await userEvent.selectOptions(screen.getByLabelText('Zeitraum Ende'), 't3');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      title: 'Rivale', description: '', characterIds: [], range: { startId: 't2', endId: 't3' }, kind: 'side', note: null,
    });
    expect(bodies[0]).not.toHaveProperty('status');
  });

  it('does not send an invalid draft and shows the issues', async () => {
    let posts = 0;
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.post('/api/books/b1/storylines', () => {
        posts += 1;
        return HttpResponse.json({});
      }),
    );
    renderApp('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Neue Storyline' }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(posts).toBe(0);
  });

  it('asks before turning a main strand with sections into a side strand', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(meOk, bookOk(richBook()));
    renderApp('/books/b1');
    await openStoryline('Hauptstrang');
    await userEvent.click(screen.getByRole('radio', { name: 'Nebenstrang' }));
    expect(confirm).toHaveBeenCalledWith(
      'Dieser Hauptstrang hat 2 Abschnitte. Sie werden in die Notiz übernommen und entfernt. Fortfahren?',
    );
    expect(screen.getByRole('radio', { name: 'Nebenstrang' })).toBeChecked();
  });

  it('keeps the kind when the conversion is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    server.use(meOk, bookOk(richBook()));
    renderApp('/books/b1');
    await openStoryline('Hauptstrang');
    await userEvent.click(screen.getByRole('radio', { name: 'Nebenstrang' }));
    expect(screen.getByRole('radio', { name: 'Hauptstrang' })).toBeChecked();
  });

  it('shows the connection count when deleting', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deletes = 0;
    server.use(
      meOk,
      bookOk(richBook()),
      http.delete('/api/books/b1/storylines/s1', () => {
        deletes += 1;
        return HttpResponse.json({ book: sampleBook(), hints: [] });
      }),
    );
    renderApp('/books/b1');
    await openStoryline('Hauptstrang');
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(confirm).toHaveBeenCalledWith('Storyline „Hauptstrang“ löschen? 1 Verbindungen werden ebenfalls entfernt.');
    await vi.waitFor(() => expect(deletes).toBe(1));
  });

  it('lists sections only for main strands', async () => {
    server.use(meOk, bookOk(richBook()));
    renderApp('/books/b1');
    await openStoryline('Hauptstrang');
    expect(screen.getByRole('region', { name: 'Abschnitte' })).toBeInTheDocument();
    await openStoryline('Rivale');
    expect(screen.queryByRole('region', { name: 'Abschnitte' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abschnitt hinzufügen' })).not.toBeInTheDocument();
  });

  it('reorders sections with the down button', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(richBook()),
      http.put('/api/books/b1/storylines/s1/sections/order', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ book: richBook(), hints: [] });
      }),
    );
    renderApp('/books/b1');
    await openStoryline('Hauptstrang');
    const region = screen.getByRole('region', { name: 'Abschnitte' });
    await userEvent.click(within(region).getByRole('button', { name: 'Abschnitt „Teil 1“ nach unten' }));
    await vi.waitFor(() => expect(bodies).toEqual([{ ids: ['x2', 'x1'] }]));
  });

  it('deletes a section after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deletes = 0;
    server.use(
      meOk,
      bookOk(richBook()),
      http.delete('/api/books/b1/sections/x2', () => {
        deletes += 1;
        return HttpResponse.json({ book: richBook(), hints: [] });
      }),
    );
    renderApp('/books/b1');
    await openStoryline('Hauptstrang');
    await userEvent.click(screen.getByRole('button', { name: 'Abschnitt „Teil 2“ löschen' }));
    expect(confirm).toHaveBeenCalledWith('Abschnitt „Teil 2“ löschen?');
    await vi.waitFor(() => expect(deletes).toBe(1));
  });

  it('adds a section defaulting to the strand range', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.post('/api/books/b1/storylines/s1/sections', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ book: sampleBook(), hints: [] }, { status: 201 });
      }),
    );
    renderApp('/books/b1');
    await openStoryline('Hauptstrang');
    await userEvent.type(screen.getByLabelText('Titel neuer Abschnitt'), 'Prolog');
    await userEvent.click(screen.getByRole('button', { name: 'Abschnitt hinzufügen' }));
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ title: 'Prolog', range: { startId: 't1', endId: 't2' } });
  });
});
