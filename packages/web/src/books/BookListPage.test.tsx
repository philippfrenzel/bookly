/** Tests for the book list page and route protection. */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render';
import { server } from '../test/setup';
import type { BookSummary } from '@bookly/shared';
import { bookResponse } from '../book/testFixtures';

/** A book list entry with defaults for everything but what the test cares about. */
function summary(over: Partial<BookSummary> & Pick<BookSummary, 'id' | 'title'>): BookSummary {
  return { storylineCount: 0, characterCount: 0, updatedAt: new Date().toISOString(), lines: [], ...over };
}

const user = { id: 'u1', email: 'a@b.de', displayName: 'Anna' };
const meOk = http.get('/api/auth/me', () => HttpResponse.json({ user }));

describe('BookListPage', () => {
  it('renders book titles', async () => {
    server.use(meOk, http.get('/api/books', () => HttpResponse.json([summary({ id: 'b1', title: 'Sturmland', storylineCount: 3 })])));
    renderApp('/');
    expect(await screen.findByText('Sturmland')).toBeInTheDocument();
  });

  it('creates a book via the inline form', async () => {
    const books: BookSummary[] = [];
    server.use(
      meOk,
      http.get('/api/books', () => HttpResponse.json(books)),
      http.post('/api/books', async ({ request }) => {
        const { title } = (await request.json()) as { title: string };
        books.push(summary({ id: 'b2', title, storylineCount: 0 }));
        const book = { id: 'b2', title, timePoints: [], characters: [], storylines: [], connections: [], acknowledgements: [] };
        return HttpResponse.json(bookResponse(book), { status: 201 });
      }),
    );
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Neues Buch' }));
    await userEvent.type(screen.getByLabelText('Titel'), 'Nebelreich');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(await screen.findByText('Nebelreich')).toBeInTheDocument();
  });

  it('renames a book inline and saves on blur', async () => {
    const bodies: unknown[] = [];
    let title = 'Sturmland';
    server.use(
      meOk,
      http.get('/api/books', () => HttpResponse.json([summary({ id: 'b1', title, storylineCount: 1 })])),
      http.patch('/api/books/b1', async ({ request }) => {
        const body = (await request.json()) as { title: string };
        bodies.push(body);
        title = body.title;
        const book = { id: 'b1', title, timePoints: [], characters: [], storylines: [], connections: [], acknowledgements: [] };
        return HttpResponse.json(bookResponse(book));
      }),
    );
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Buch „Sturmland“ umbenennen' }));
    const input = screen.getByLabelText('Titel Buch Sturmland');
    await userEvent.clear(input);
    await userEvent.type(input, 'Nebelland');
    await userEvent.tab();
    await vi.waitFor(() => expect(bodies).toEqual([{ title: 'Nebelland' }]));
    expect(await screen.findByText('Nebelland')).toBeInTheDocument();
  });

  it('deletes a book after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let books = [summary({ id: 'b1', title: 'Sturmland', storylineCount: 2 })];
    let deletes = 0;
    server.use(
      meOk,
      http.get('/api/books', () => HttpResponse.json(books)),
      http.delete('/api/books/b1', () => {
        deletes += 1;
        books = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Buch „Sturmland“ löschen' }));
    expect(confirm).toHaveBeenCalledWith('Buch „Sturmland“ löschen? Alle Storylines dieses Buchs werden entfernt.');
    await vi.waitFor(() => expect(deletes).toBe(1));
    await vi.waitFor(() => expect(screen.queryByText('Sturmland')).not.toBeInTheDocument());
    confirm.mockRestore();
  });

  it('does not delete when the confirmation is declined', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    let deletes = 0;
    server.use(
      meOk,
      http.get('/api/books', () => HttpResponse.json([summary({ id: 'b1', title: 'Sturmland', storylineCount: 2 })])),
      http.delete('/api/books/b1', () => {
        deletes += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Buch „Sturmland“ löschen' }));
    expect(deletes).toBe(0);
    confirm.mockRestore();
  });

  it('shows a generic alert when renaming fails', async () => {
    server.use(
      meOk,
      http.get('/api/books', () => HttpResponse.json([summary({ id: 'b1', title: 'Sturmland', storylineCount: 2 })])),
      http.patch('/api/books/b1', () => HttpResponse.json({ error: 'internal_error' }, { status: 500 })),
    );
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Buch „Sturmland“ umbenennen' }));
    const input = screen.getByLabelText('Titel Buch Sturmland');
    await userEvent.clear(input);
    await userEvent.type(input, 'X');
    await userEvent.tab();
    expect(await screen.findByText('Speichern fehlgeschlagen. Bitte erneut versuchen.')).toBeInTheDocument();
  });

  it('greets the author and offers the most recently edited book', async () => {
    server.use(
      meOk,
      http.get('/api/books', () =>
        HttpResponse.json([
          summary({ id: 'b1', title: 'Sturmland', updatedAt: '2026-01-01T10:00:00Z' }),
          summary({
            id: 'b2',
            title: 'Nebelreich',
            storylineCount: 2,
            characterCount: 1,
            updatedAt: '2026-03-01T10:00:00Z',
            lines: [{ color: '#2f6fa8', kind: 'main', start: 0, end: 1 }],
          }),
        ]),
      ),
    );
    renderApp('/');
    expect(await screen.findByText(/Hallo Anna, schön, dass du da bist\. 2 Bücher und 2 Handlungsstränge warten auf dich\./)).toBeInTheDocument();
    const cont = screen.getByRole('link', { name: 'Weitermachen mit „Nebelreich“' });
    expect(cont).toHaveAttribute('href', '/books/b2');
    expect(screen.getAllByText('2 Handlungsstränge · 1 Figur').length).toBeGreaterThan(0);
  });

  it('shows a friendly empty shelf', async () => {
    server.use(meOk, http.get('/api/books', () => HttpResponse.json([])));
    renderApp('/');
    expect(await screen.findByText('Noch keine Bücher.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Weitermachen/ })).not.toBeInTheDocument();
  });

  it('redirects to login when not authenticated', async () => {
    server.use(http.get('/api/auth/me', () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })));
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
  });
});
