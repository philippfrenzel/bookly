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
      http.post('/api/books/b1/characters/c2/suggestion', () => HttpResponse.json({ behavior: '', intentions: '' })),
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
      http.post('/api/books/b1/characters/c2/suggestion', () => HttpResponse.json({ behavior: '', intentions: '' })),
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

  it('requests exactly one suggestion after a changed description and none on mount', async () => {
    const suggestions: unknown[] = [];
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.patch('/api/books/b1/characters/c2', () => HttpResponse.json(bookResponse(sampleBook()))),
      http.post('/api/books/b1/characters/c2/suggestion', async ({ request }) => {
        suggestions.push(await request.json());
        return HttpResponse.json({ behavior: 'mutig', intentions: 'Heimkehr' });
      }),
    );
    await openPanel();
    expect(suggestions).toEqual([]);
    await userEvent.type(screen.getByLabelText('Beschreibung Figur Jon'), 'Schmied');
    await userEvent.tab();
    expect(await screen.findByText('mutig')).toBeInTheDocument();
    expect(suggestions).toEqual([{ name: 'Jon', description: 'Schmied', behavior: null, intentions: null }]);
  });

  it('applies a suggestion into an empty field without asking, via PATCH', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.post('/api/books/b1/characters/c2/suggestion', () => HttpResponse.json({ behavior: 'mutig', intentions: 'Heimkehr' })),
      http.patch('/api/books/b1/characters/c2', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(sampleBook()));
      }),
    );
    await openPanel();
    await userEvent.click(screen.getAllByRole('button', { name: 'Vorschlagen' })[1]!);
    const apply = await screen.findAllByRole('button', { name: 'Übernehmen' });
    await userEvent.click(apply[0]!);
    expect(confirm).not.toHaveBeenCalled();
    expect(bodies).toEqual([{ behavior: 'mutig' }]);
  });

  it('asks before replacing a non-empty field with a suggestion', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const bodies: unknown[] = [];
    const book = sampleBook();
    book.characters[1]!.behavior = 'alt';
    server.use(
      meOk,
      bookOk(book),
      http.post('/api/books/b1/characters/c2/suggestion', () => HttpResponse.json({ behavior: 'mutig', intentions: 'Heimkehr' })),
      http.patch('/api/books/b1/characters/c2', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(book));
      }),
    );
    await openPanel();
    await userEvent.click(screen.getAllByRole('button', { name: 'Vorschlagen' })[1]!);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Übernehmen' }))[0]!);
    expect(confirm).toHaveBeenCalledWith('Vorhandenen Text ersetzen?');
    expect(bodies).toEqual([{ behavior: 'mutig' }]);
  });

  it('dismisses a suggestion with Verwerfen', async () => {
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.post('/api/books/b1/characters/c2/suggestion', () => HttpResponse.json({ behavior: 'mutig', intentions: 'Heimkehr' })),
    );
    await openPanel();
    await userEvent.click(screen.getAllByRole('button', { name: 'Vorschlagen' })[1]!);
    await userEvent.click(await screen.findByRole('button', { name: 'Verwerfen' }));
    expect(screen.queryByText('mutig')).not.toBeInTheDocument();
  });

  it('shows a short message when the suggestion fails', async () => {
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.post('/api/books/b1/characters/c2/suggestion', () => HttpResponse.json({ error: 'ai_failed' }, { status: 502 })),
    );
    await openPanel();
    await userEvent.click(screen.getAllByRole('button', { name: 'Vorschlagen' })[1]!);
    expect(await screen.findByText('Vorschlag fehlgeschlagen.')).toBeInTheDocument();
  });

  it('disables Vorschlagen when the AI is not configured', async () => {
    server.use(meOk, bookOk(sampleBook(), { ai: { enabled: false } }));
    await openPanel();
    const button = screen.getAllByRole('button', { name: 'Vorschlagen' })[0]!;
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'KI nicht eingerichtet');
  });

  it('does not request a suggestion after a description change when the AI is off', async () => {
    let posts = 0;
    server.use(
      meOk,
      bookOk(sampleBook(), { ai: { enabled: false } }),
      http.patch('/api/books/b1/characters/c2', () => HttpResponse.json(bookResponse(sampleBook()))),
      http.post('/api/books/b1/characters/c2/suggestion', () => {
        posts += 1;
        return HttpResponse.json({}, { status: 503 });
      }),
    );
    await openPanel();
    await userEvent.type(screen.getByLabelText('Beschreibung Figur Jon'), 'x');
    await userEvent.tab();
    expect(posts).toBe(0);
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

  it('asks before overwriting typed but unsaved text and keeps it when declined', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.post('/api/books/b1/characters/c2/suggestion', () => HttpResponse.json({ behavior: 'mutig', intentions: 'Heimkehr' })),
      http.patch('/api/books/b1/characters/c2', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(sampleBook()));
      }),
    );
    await openPanel();
    await userEvent.click(screen.getAllByRole('button', { name: 'Vorschlagen' })[1]!);
    const apply = await screen.findAllByRole('button', { name: 'Übernehmen' });
    await userEvent.type(screen.getByLabelText('Verhalten Figur Jon'), 'getippt');
    await userEvent.click(apply[0]!);
    expect(confirm).toHaveBeenCalledWith('Vorhandenen Text ersetzen?');
    expect(bodies).not.toContainEqual({ behavior: 'mutig' });
    expect(screen.getByLabelText('Verhalten Figur Jon')).toHaveValue('getippt');
  });
  it('offers no „Übernehmen“ for an empty suggested field', async () => {
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.post('/api/books/b1/characters/c2/suggestion', () => HttpResponse.json({ behavior: '', intentions: 'Heimkehr' })),
    );
    await openPanel();
    await userEvent.click(screen.getAllByRole('button', { name: 'Vorschlagen' })[1]!);
    expect(await screen.findByText('Heimkehr')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Übernehmen' })).toHaveLength(1);
  });
});
