/** Tests for creating and editing connections with instant hints. */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Book } from '@bookly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookOk, meOk, sampleBook, bookResponse } from '../book/testFixtures';
import { renderApp } from '../test/render';
import { server } from '../test/setup';

/** Sample book plus an earlier side strand „Früh“ (Anfang only) that has Mira in it. */
function twoStrands(): Book {
  const book = sampleBook();
  book.storylines.push({
    id: 's2', title: 'Früh', description: '', characterIds: ['c1'], range: { startId: 't1', endId: 't1' },
    kind: 'side', status: 'open', color: '#8A94A6', note: null, additions: [], sections: [],
  });
  return book;
}

const MESSAGE = 'Zeitsprung: „Früh“ beginnt nicht nach dem Ende von „Hauptstrang“.';

afterEach(() => vi.restoreAllMocks());

async function openDialog() {
  await userEvent.click(await screen.findByRole('button', { name: 'Storyline „Hauptstrang“' }));
  await userEvent.selectOptions(screen.getByLabelText('Verbinden mit …'), 's2');
  await userEvent.click(screen.getByRole('button', { name: 'Verbinden' }));
  return screen.findByRole('dialog', { name: 'Verbindung' });
}

describe('ConnectionDialog', () => {
  it('shows the time-jump hint before saving and still allows saving', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(twoStrands()),
      http.post('/api/books/b1/connections', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(twoStrands()), { status: 201 });
      }),
    );
    renderApp('/books/b1');
    const dialog = await openDialog();
    await userEvent.selectOptions(within(dialog).getByLabelText('Art'), 'time_jump');
    expect(within(dialog).getByText(MESSAGE)).toBeInTheDocument();
    const save = within(dialog).getByRole('button', { name: 'Speichern' });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await vi.waitFor(() => expect(bodies).toEqual([{ fromId: 's1', toId: 's2', type: 'time_jump', label: null, characterId: null }]));
  });

  it('shows the character select only for „Figur wechselt“', async () => {
    server.use(meOk, bookOk(twoStrands()));
    renderApp('/books/b1');
    const dialog = await openDialog();
    expect(within(dialog).queryByLabelText('Figur')).not.toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText('Art'), 'character_switch');
    expect(within(dialog).getByLabelText('Figur')).toBeInTheDocument();
    expect(within(dialog).getByText('Figur wechselt: Figur fehlt.')).toBeInTheDocument();
  });

  it('acknowledges a hint with „Bewusst so“ when editing', async () => {
    const book = twoStrands();
    book.connections = [{ id: 'k1', fromId: 's1', toId: 's2', type: 'time_jump', label: null, characterId: null }];
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(book),
      http.post('/api/books/b1/acknowledgements', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(book));
      }),
    );
    renderApp('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Verbindung „Hauptstrang“ → „Früh“' }));
    const dialog = await screen.findByRole('dialog', { name: 'Verbindung' });
    expect(within(dialog).getByText(MESSAGE)).toBeInTheDocument();
    // Mira is in both strands, so an overlap hint follows the order hint; the first button belongs to the order hint.
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Bewusst so' })[0]!);
    await vi.waitFor(() =>
      expect(bodies).toEqual([{ connectionId: 'k1', rule: 'time_jump_order', characterId: null }]),
    );
  });

  it('deletes a connection after confirmation', async () => {
    const book = twoStrands();
    book.connections = [{ id: 'k1', fromId: 's1', toId: 's2', type: 'time_jump', label: null, characterId: null }];
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deletes = 0;
    server.use(
      meOk,
      bookOk(book),
      http.delete('/api/books/b1/connections/k1', () => {
        deletes += 1;
        return HttpResponse.json(bookResponse(twoStrands()));
      }),
    );
    renderApp('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Verbindung „Hauptstrang“ → „Früh“' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Löschen' }));
    expect(confirm).toHaveBeenCalledWith('Verbindung löschen?');
    await vi.waitFor(() => expect(deletes).toBe(1));
  });

  it('shows server issues when saving is rejected with 422', async () => {
    server.use(
      meOk,
      bookOk(twoStrands()),
      http.post('/api/books/b1/connections', () =>
        HttpResponse.json({ issues: [{ code: 'x', elementId: 's2', message: 'Ziel existiert nicht mehr.' }] }, { status: 422 }),
      ),
    );
    renderApp('/books/b1');
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(await within(dialog).findByText('Ziel existiert nicht mehr.')).toBeInTheDocument();
  });

  it('reopens an acknowledged hint with DELETE and the acknowledgement body', async () => {
    const book = twoStrands();
    book.connections = [{ id: 'k1', fromId: 's1', toId: 's2', type: 'time_jump', label: null, characterId: null }];
    book.acknowledgements = [{ connectionId: 'k1', rule: 'time_jump_order', characterId: null }];
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(book),
      http.delete('/api/books/b1/acknowledgements', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(book));
      }),
    );
    renderApp('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Verbindung „Hauptstrang“ → „Früh“' }));
    const dialog = await screen.findByRole('dialog', { name: 'Verbindung' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Wieder anzeigen' }));
    await vi.waitFor(() => expect(bodies).toEqual([{ connectionId: 'k1', rule: 'time_jump_order', characterId: null }]));
  });

  it('closes on Escape and hides acknowledge buttons while the draft is changed', async () => {
    const book = twoStrands();
    book.connections = [{ id: 'k1', fromId: 's1', toId: 's2', type: 'time_jump', label: null, characterId: null }];
    server.use(meOk, bookOk(book));
    renderApp('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Verbindung „Hauptstrang“ → „Früh“' }));
    const dialog = await screen.findByRole('dialog', { name: 'Verbindung' });
    expect(dialog).toHaveFocus();
    await userEvent.type(within(dialog).getByLabelText('Beschriftung'), 'x');
    expect(within(dialog).queryByRole('button', { name: 'Bewusst so' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('label wand', () => {
    const textHandler = (bodies: Record<string, unknown>[] = []) =>
      http.post('/api/books/b1/ai/text', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ suggestions: ['A1', 'A2', 'A3'] });
      });

    it('label wand sends the connection target', async () => {
      const bodies: Record<string, unknown>[] = [];
      server.use(meOk, bookOk(twoStrands()), textHandler(bodies));
      renderApp('/books/b1');
      const dialog = await openDialog();
      await userEvent.click(within(dialog).getByRole('button', { name: 'KI-Assistent: Beschriftung' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Vorschlagen' }));
      await screen.findByText('1/3');
      expect(within(dialog).getByLabelText('Beschriftung')).toHaveValue('A1');
      expect(bodies[0]).toMatchObject({ target: { kind: 'connection', fromId: 's1', toId: 's2', field: 'label' } });
    });

    it('Escape closes the bar but not the dialog', async () => {
      server.use(meOk, bookOk(twoStrands()), textHandler());
      renderApp('/books/b1');
      const dialog = await openDialog();
      await userEvent.click(within(dialog).getByRole('button', { name: 'KI-Assistent: Beschriftung' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Vorschlagen' }));
      await screen.findByText('1/3');
      await userEvent.keyboard('{Escape}');
      expect(within(dialog).getByLabelText('Beschriftung')).toHaveValue('');
      expect(screen.getByRole('dialog', { name: 'Verbindung' })).toBeInTheDocument();
      expect(screen.queryByText('1/3')).not.toBeInTheDocument();
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
