/** Tests for the book page load errors. */
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';
import { server } from '../test/setup';
import { meOk } from './testFixtures';

describe('BookPage load errors', () => {
  it('says the book was not found on 404', async () => {
    server.use(meOk, http.get('/api/books/b1', () => HttpResponse.json({ error: 'not_found' }, { status: 404 })));
    renderApp('/books/b1');
    expect(await screen.findByText('Buch nicht gefunden.')).toBeInTheDocument();
  });

  it('says the book could not be loaded on other errors', async () => {
    server.use(meOk, http.get('/api/books/b1', () => HttpResponse.json({ error: 'internal_error' }, { status: 500 })));
    renderApp('/books/b1');
    expect(await screen.findByText('Das Buch konnte nicht geladen werden.')).toBeInTheDocument();
  });

  it('redirects to login when the session expired while loading', async () => {
    server.use(meOk, http.get('/api/books/b1', () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })));
    renderApp('/books/b1');
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
  });
});
