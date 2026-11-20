/** Tests for the book list page and route protection. */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';
import { server } from '../test/setup';

const user = { id: 'u1', email: 'a@b.de', displayName: 'Anna' };
const meOk = http.get('/api/auth/me', () => HttpResponse.json({ user }));

describe('BookListPage', () => {
  it('renders book titles', async () => {
    server.use(meOk, http.get('/api/books', () => HttpResponse.json([{ id: 'b1', title: 'Sturmland', storylineCount: 3 }])));
    renderApp('/');
    expect(await screen.findByText('Sturmland')).toBeInTheDocument();
  });

  it('creates a book via the inline form', async () => {
    const books: { id: string; title: string; storylineCount: number }[] = [];
    server.use(
      meOk,
      http.get('/api/books', () => HttpResponse.json(books)),
      http.post('/api/books', async ({ request }) => {
        const { title } = (await request.json()) as { title: string };
        books.push({ id: 'b2', title, storylineCount: 0 });
        const book = { id: 'b2', title, timePoints: [], characters: [], storylines: [], connections: [], acknowledgements: [] };
        return HttpResponse.json({ book, hints: [] }, { status: 201 });
      }),
    );
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Neues Buch' }));
    await userEvent.type(screen.getByLabelText('Titel'), 'Nebelreich');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(await screen.findByText('Nebelreich')).toBeInTheDocument();
  });

  it('redirects to login when not authenticated', async () => {
    server.use(http.get('/api/auth/me', () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })));
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
  });
});
