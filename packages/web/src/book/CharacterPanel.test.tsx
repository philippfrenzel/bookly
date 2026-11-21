/** Tests for the character panel: add, rename, describe, delete with confirm. */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render';
import { server } from '../test/setup';
import { bookOk, meOk, sampleBook, bookResponse } from './testFixtures';

async function openPanel() {
  renderApp('/books/b1');
  await userEvent.click(await screen.findByRole('tab', { name: 'Figuren' }));
}

afterEach(() => vi.restoreAllMocks());

describe('CharacterPanel', () => {
  it('adds a character', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.post('/api/books/b1/characters', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(sampleBook()), { status: 201 });
      }),
    );
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Figur' }));
    expect(bodies).toEqual([{ name: 'Neue Figur', description: '' }]);
  });

  it('renames and describes on blur', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.patch('/api/books/b1/characters/c2', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(sampleBook()));
      }),
    );
    await openPanel();
    const name = screen.getByLabelText('Name Figur Jon');
    await userEvent.clear(name);
    await userEvent.type(name, 'Jonas');
    await userEvent.tab();
    await userEvent.type(screen.getByLabelText('Beschreibung Figur Jon'), 'Schmied');
    await userEvent.tab();
    expect(bodies).toEqual([{ name: 'Jonas' }, { description: 'Schmied' }]);
  });

  it('deletes after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deletes = 0;
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.delete('/api/books/b1/characters/c1', () => {
        deletes += 1;
        return HttpResponse.json(bookResponse(sampleBook()));
      }),
    );
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Figur „Mira“ löschen' }));
    expect(confirm).toHaveBeenCalledWith('Figur „Mira“ aus allen Storylines entfernen?');
    expect(deletes).toBe(1);
  });

  it('does not delete when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    let deletes = 0;
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.delete('/api/books/b1/characters/c1', () => {
        deletes += 1;
        return HttpResponse.json({});
      }),
    );
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Figur „Mira“ löschen' }));
    expect(deletes).toBe(0);
  });

  it('keeps focus and typed text when the PATCH response returns the updated book', async () => {
    const stored = sampleBook();
    server.use(
      meOk,
      http.get('/api/books/b1', () => HttpResponse.json(bookResponse(stored))),
      http.patch('/api/books/b1/characters/c2', async ({ request }) => {
        const body = (await request.json()) as { name?: string; description?: string };
        stored.characters[1] = { ...stored.characters[1]!, ...body };
        return HttpResponse.json(bookResponse(stored));
      }),
    );
    await openPanel();
    const name = screen.getByLabelText('Name Figur Jon');
    await userEvent.clear(name);
    await userEvent.type(name, 'Jonas');
    await userEvent.tab();
    await userEvent.tab(); // skips the name field's wand button
    const description = screen.getByLabelText(/^Beschreibung Figur Jon/);
    expect(description).toHaveFocus();
    await userEvent.type(description, 'Schmied');
    expect(await screen.findByLabelText('Name Figur Jonas')).toHaveValue('Jonas');
    const after = screen.getByLabelText('Beschreibung Figur Jonas');
    expect(after).toHaveFocus();
    expect(after).toHaveValue('Schmied');
  });

  it('renders server issues from a 422', async () => {
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.patch('/api/books/b1/characters/c2', () =>
        HttpResponse.json(
          { issues: [{ code: 'empty_title', elementId: 'c2', message: 'Figur: Name fehlt.' }] },
          { status: 422 },
        ),
      ),
    );
    await openPanel();
    const name = screen.getByLabelText('Name Figur Jon');
    await userEvent.clear(name);
    await userEvent.type(name, 'X');
    await userEvent.tab();
    expect(await screen.findByRole('alert')).toHaveTextContent('Figur: Name fehlt.');
    expect(screen.getByLabelText('Name Figur Jon')).toHaveValue('Jon');
  });

  it('shows a generic alert when saving fails', async () => {
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.post('/api/books/b1/characters', () => HttpResponse.json({ error: 'internal_error' }, { status: 500 })),
    );
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Figur' }));
    expect(await screen.findByText('Speichern fehlgeschlagen. Bitte erneut versuchen.')).toHaveAttribute('role', 'alert');
  });

  it('renders name, description, behavior and intentions per character', async () => {
    server.use(meOk, bookOk(sampleBook()));
    await openPanel();
    for (const label of ['Name', 'Beschreibung', 'Verhalten', 'Absichten']) {
      expect(screen.getByLabelText(`${label} Figur Mira`)).toBeInTheDocument();
    }
  });

  it('saves an emptied name as null and labels the character unnamed', async () => {
    const bodies: unknown[] = [];
    const stored = sampleBook();
    server.use(
      meOk,
      http.get('/api/books/b1', () => HttpResponse.json(bookResponse(stored))),
      http.patch('/api/books/b1/characters/c2', async ({ request }) => {
        bodies.push(await request.json());
        stored.characters[1] = { ...stored.characters[1]!, name: null };
        return HttpResponse.json(bookResponse(stored));
      }),
    );
    await openPanel();
    await userEvent.clear(screen.getByLabelText('Name Figur Jon'));
    await userEvent.tab();
    expect(bodies).toEqual([{ name: null }]);
    expect(await screen.findByRole('button', { name: 'Figur „Unbenannte Figur“ löschen' })).toBeInTheDocument();
  });

  it('saves behavior and intentions on blur with only the changed field', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.patch('/api/books/b1/characters/c2', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(sampleBook()));
      }),
    );
    await openPanel();
    await userEvent.type(screen.getByLabelText('Verhalten Figur Jon'), 'ruhig');
    await userEvent.tab();
    await userEvent.type(screen.getByLabelText('Absichten Figur Jon'), 'Rache');
    await userEvent.tab();
    expect(bodies).toEqual([{ behavior: 'ruhig' }, { intentions: 'Rache' }]);
  });

  it('no request on description blur', async () => {
    const calls: string[] = [];
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.patch('/api/books/b1/characters/c2', () => HttpResponse.json(bookResponse(sampleBook()))),
      http.post('/api/books/b1/ai/text', () => { calls.push('text'); return HttpResponse.json({ suggestions: ['A1', 'A2', 'A3'] }); }),
    );
    await openPanel();
    await userEvent.type(screen.getByLabelText('Beschreibung Figur Jon'), 'Schmied');
    await userEvent.tab();
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toEqual([]);
  });

  it('wand on Verhalten inserts and saves on blur', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.post('/api/books/b1/ai/text', () => HttpResponse.json({ suggestions: ['A1', 'A2', 'A3'] })),
      http.patch('/api/books/b1/characters/c2', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(sampleBook()));
      }),
    );
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'KI-Assistent: Verhalten Figur Jon' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Vorschlagen' }));
    await screen.findByText('1/3');
    await userEvent.tab();
    await vi.waitFor(() => expect(bodies).toEqual([{ behavior: 'A1' }]));
  });

  it('wand disabled when AI is off', async () => {
    server.use(meOk, bookOk(sampleBook(), { ai: { enabled: false } }));
    await openPanel();
    expect(screen.getByRole('button', { name: 'KI-Assistent: Verhalten Figur Jon' })).toBeDisabled();
  });

  it('polls the book again while a check is pending', async () => {
    let gets = 0;
    server.use(
      meOk,
      http.get('/api/books/b1', () => {
        gets += 1;
        return HttpResponse.json(bookResponse(sampleBook(), { characterChecks: [{ storylineId: 's1', status: 'pending', finishedAt: null, error: null }] }));
      }),
    );
    renderApp('/books/b1');
    await screen.findByRole('tab', { name: 'Figuren' });
    await vi.waitFor(() => expect(gets).toBeGreaterThanOrEqual(2), { timeout: 5000 });
  }, 8000);

});
