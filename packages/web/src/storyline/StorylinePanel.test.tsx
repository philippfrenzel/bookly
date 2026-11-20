/** Tests for storyline and section editing in the side panel. */
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Book, Section } from '@bookly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookOk, meOk, sampleBook, bookResponse } from '../book/testFixtures';
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
    kind: 'side', status: 'open', color: '#8A94A6', note: null, additions: [], sections: [],
  });
  book.connections = [{ id: 'k1', fromId: 's1', toId: 's2', type: 'time_jump', label: null, characterId: null }];
  return book;
}

afterEach(() => vi.restoreAllMocks());

/** Mira's checkbox in the storyline form (the section form below has its own). */
async function miraCheckbox() {
  const region = await screen.findByRole('region', { name: 'Storyline bearbeiten' });
  return within(region.querySelector('.storyline-form') as HTMLElement).getByRole('checkbox', { name: 'Mira' });
}

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
        return HttpResponse.json(bookResponse(sampleBook()), { status: 201 });
      }),
    );
    renderApp('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Neue Storyline' }));
    await userEvent.type(screen.getByLabelText('Titel'), 'Rivale');
    await userEvent.click(screen.getByRole('radio', { name: 'Nebenstrang' }));
    await userEvent.selectOptions(screen.getByLabelText('Zeitraum Start'), 't2');
    await userEvent.selectOptions(screen.getByLabelText('Zeitraum Ende'), 't3');
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      title: 'Rivale', description: '', characterIds: [], range: { startId: 't2', endId: 't3' }, kind: 'side', note: null,
      color: expect.stringMatching(/^#[0-9A-Fa-f]{6}$/),
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
    await userEvent.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(posts).toBe(0);
  });

  it('asks before turning a main strand with sections into a side strand', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const bodies: unknown[] = [];
    const converted = richBook();
    converted.storylines[0]!.kind = 'side';
    converted.storylines[0]!.sections = [];
    server.use(
      meOk,
      bookOk(richBook()),
      http.patch('/api/books/b1/storylines/s1', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(converted));
      }),
    );
    renderApp('/books/b1');
    await openStoryline('Hauptstrang');
    await userEvent.click(screen.getByRole('radio', { name: 'Nebenstrang' }));
    expect(confirm).toHaveBeenCalledWith(
      'Dieser Hauptstrang hat 2 Abschnitte. Sie werden in die Notiz übernommen und entfernt. Fortfahren?',
    );
    await vi.waitFor(() => expect(bodies).toEqual([{ kind: 'side' }]));
    await vi.waitFor(() => expect(screen.getByRole('radio', { name: 'Nebenstrang' })).toBeChecked());
  });

  it('keeps the kind when the conversion is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    let patches = 0;
    server.use(
      meOk,
      bookOk(richBook()),
      http.patch('/api/books/b1/storylines/s1', () => {
        patches += 1;
        return HttpResponse.json({});
      }),
    );
    renderApp('/books/b1');
    await openStoryline('Hauptstrang');
    await userEvent.click(screen.getByRole('radio', { name: 'Nebenstrang' }));
    expect(screen.getByRole('radio', { name: 'Hauptstrang' })).toBeChecked();
    expect(patches).toBe(0);
  });

  it('shows the connection count when deleting', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deletes = 0;
    server.use(
      meOk,
      bookOk(richBook()),
      http.delete('/api/books/b1/storylines/s1', () => {
        deletes += 1;
        return HttpResponse.json(bookResponse(sampleBook()));
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
        return HttpResponse.json(bookResponse(richBook()));
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
        return HttpResponse.json(bookResponse(richBook()));
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
        return HttpResponse.json(bookResponse(sampleBook()), { status: 201 });
      }),
    );
    renderApp('/books/b1');
    await openStoryline('Hauptstrang');
    await userEvent.type(screen.getByLabelText('Titel neuer Abschnitt'), 'Prolog');
    await userEvent.click(screen.getByRole('button', { name: 'Abschnitt hinzufügen' }));
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ title: 'Prolog', range: { startId: 't1', endId: 't2' } });
  });
  describe('direct saving (no Speichern button)', () => {
    /** Registers a PATCH handler that records bodies and answers with the given status/body. */
    function patchStoryline(bodies: unknown[], respond: () => Response = () => HttpResponse.json(bookResponse(sampleBook()))) {
      return http.patch('/api/books/b1/storylines/s1', async ({ request }) => {
        bodies.push(await request.json());
        return respond();
      });
    }

    it('has no save button in edit mode and saves text fields on blur', async () => {
      const bodies: unknown[] = [];
      server.use(meOk, bookOk(sampleBook()), patchStoryline(bodies));
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      expect(screen.queryByRole('button', { name: 'Speichern' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Anlegen' })).not.toBeInTheDocument();
      const title = screen.getByLabelText('Titel');
      await userEvent.clear(title);
      await userEvent.type(title, 'Neu');
      expect(bodies).toEqual([]);
      await userEvent.tab();
      await vi.waitFor(() => expect(bodies).toEqual([{ title: 'Neu' }]));
    });

    it('saves status, characters and colour on change, one field per request', async () => {
      const bodies: unknown[] = [];
      server.use(meOk, bookOk(sampleBook()), patchStoryline(bodies));
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      await userEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('radio', { name: 'abgeschlossen' }));
      await vi.waitFor(() => expect(bodies).toHaveLength(1));
      await userEvent.click(within(within(screen.getByRole('region', { name: 'Storyline bearbeiten' })).getByRole('group', { name: 'Figuren' })).getByRole('checkbox', { name: 'Jon' }));
      await vi.waitFor(() => expect(bodies).toHaveLength(2));
      fireEvent.change(screen.getByLabelText('Farbe'), { target: { value: '#112233' } });
      await vi.waitFor(() => expect(bodies).toHaveLength(3));
      expect(bodies).toEqual([{ status: 'completed' }, { characterIds: ['c1', 'c2'] }, { color: '#112233' }]);
    });

    it('does not send a locally invalid change, shows the issues and reverts the field', async () => {
      const bodies: unknown[] = [];
      server.use(meOk, bookOk(sampleBook()), patchStoryline(bodies));
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      await userEvent.selectOptions(screen.getByLabelText('Zeitraum Start'), 't3');
      expect(await screen.findByText('Das geht so nicht:')).toBeInTheDocument();
      expect(bodies).toEqual([]);
      expect(screen.getByLabelText('Zeitraum Start')).toHaveValue('t1');
    });

    it('shows a generic alert for non-422 failures and reverts the field', async () => {
      const bodies: unknown[] = [];
      server.use(
        meOk,
        bookOk(sampleBook()),
        patchStoryline(bodies, () => HttpResponse.json({ error: 'internal_error' }, { status: 500 })),
      );
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      const title = screen.getByLabelText('Titel');
      await userEvent.clear(title);
      await userEvent.type(title, 'Neu');
      await userEvent.tab();
      expect(await screen.findByText('Speichern fehlgeschlagen. Bitte erneut versuchen.')).toHaveAttribute('role', 'alert');
      await vi.waitFor(() => expect(screen.getByLabelText('Titel')).toHaveValue('Hauptstrang'));
    });

    it('redirects to the login page when the session has expired', async () => {
      const bodies: unknown[] = [];
      server.use(
        meOk,
        bookOk(sampleBook()),
        patchStoryline(bodies, () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })),
      );
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      await userEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('radio', { name: 'bewusst offen' }));
      expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
    });

    it('limits input lengths like the API schema', async () => {
      server.use(meOk, bookOk(richBook()));
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      expect(screen.getByLabelText('Titel')).toHaveAttribute('maxlength', '200');
      expect(screen.getByLabelText('Kurzbeschreibung')).toHaveAttribute('maxlength', '2000');
      expect(screen.getByLabelText('Notiz')).toHaveAttribute('maxlength', '10000');
    });

    it('saves a section field on blur', async () => {
      const bodies: unknown[] = [];
      server.use(
        meOk,
        bookOk(richBook()),
        http.patch('/api/books/b1/sections/x1', async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json(bookResponse(richBook()));
        }),
      );
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      await userEvent.click(screen.getByRole('button', { name: 'Abschnitt „Teil 1“ bearbeiten' }));
      expect(screen.queryByRole('button', { name: 'Abschnitt speichern' })).not.toBeInTheDocument();
      const title = screen.getByLabelText('Titel Teil 1');
      await userEvent.clear(title);
      await userEvent.type(title, 'Prolog');
      await userEvent.tab();
      await vi.waitFor(() => expect(bodies).toEqual([{ title: 'Prolog' }]));
    });

    it('keeps the add-section input when the request fails', async () => {
      server.use(
        meOk,
        bookOk(sampleBook()),
        http.post('/api/books/b1/storylines/s1/sections', () => HttpResponse.json({ error: 'internal_error' }, { status: 500 })),
      );
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      await userEvent.type(screen.getByLabelText('Titel neuer Abschnitt'), 'Prolog');
      await userEvent.click(screen.getByRole('button', { name: 'Abschnitt hinzufügen' }));
      expect(await screen.findByText('Speichern fehlgeschlagen. Bitte erneut versuchen.')).toBeInTheDocument();
      expect(screen.getByLabelText('Titel neuer Abschnitt')).toHaveValue('Prolog');
    });
  });
  describe('character additions and check status', () => {
    const toggleName = 'Ergänzung für Mira';

    function additionBook(): Book {
      const book = sampleBook();
      book.characters[0]!.behavior = 'ruhig';
      book.characters[0]!.intentions = 'Heimkehr';
      return book;
    }

    it('shows the base profile line when expanded and no toggle when creating', async () => {
      server.use(meOk, bookOk(additionBook()));
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      const toggle = await screen.findByRole('button', { name: toggleName });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('Grundprofil: ruhig · Heimkehr')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Neue Storyline' }));
      expect(screen.queryByRole('button', { name: toggleName })).not.toBeInTheDocument();
    });

    it('omits empty parts of the base profile line', async () => {
      const book = sampleBook();
      book.characters[0]!.intentions = 'Heimkehr';
      server.use(meOk, bookOk(book));
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      await userEvent.click(await screen.findByRole('button', { name: toggleName }));
      expect(screen.getByText('Grundprofil: Heimkehr')).toBeInTheDocument();
    });

    it('hides the base profile line when the profile is empty', async () => {
      server.use(meOk, bookOk(sampleBook()));
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      await userEvent.click(await screen.findByRole('button', { name: toggleName }));
      expect(screen.queryByText(/Grundprofil/)).not.toBeInTheDocument();
    });

    it('PUTs the changed addition field on blur', async () => {
      const bodies: unknown[] = [];
      server.use(
        meOk,
        bookOk(sampleBook()),
        http.put('/api/books/b1/storylines/s1/characters/c1/addition', async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json(bookResponse(sampleBook()));
        }),
      );
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      await userEvent.click(await screen.findByRole('button', { name: toggleName }));
      await userEvent.type(screen.getByLabelText('Verhalten Ergänzung Mira'), 'wird misstrauisch');
      await userEvent.tab();
      await vi.waitFor(() => expect(bodies).toEqual([{ behavior: 'wird misstrauisch' }]));
    });

    function withAddition(): Book {
      const book = sampleBook();
      book.storylines[0]!.additions = [{ characterId: 'c1', behavior: 'misstrauisch', intentions: '' }];
      return book;
    }

    it('asks before unchecking a character whose addition has text; cancel keeps it', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      let patches = 0;
      server.use(
        meOk,
        bookOk(withAddition()),
        http.patch('/api/books/b1/storylines/s1', () => {
          patches += 1;
          return HttpResponse.json(bookResponse(withAddition()));
        }),
      );
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      await userEvent.click(await miraCheckbox());
      expect(confirm).toHaveBeenCalledWith('Ergänzung für Mira geht verloren. Entfernen?');
      expect((await miraCheckbox())).toBeChecked();
      expect(patches).toBe(0);
    });

    it('asks before unchecking when the addition text is typed but not yet saved', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      let patches = 0;
      server.use(
        meOk,
        bookOk(sampleBook()),
        http.put('/api/books/b1/storylines/s1/characters/c1/addition', () => HttpResponse.json(bookResponse(sampleBook()))),
        http.patch('/api/books/b1/storylines/s1', () => {
          patches += 1;
          return HttpResponse.json(bookResponse(sampleBook()));
        }),
      );
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      await userEvent.click(await screen.findByRole('button', { name: toggleName }));
      await userEvent.type(screen.getByLabelText('Verhalten Ergänzung Mira'), 'ungespeichert');
      await userEvent.click(await miraCheckbox());
      expect(confirm).toHaveBeenCalledWith('Ergänzung für Mira geht verloren. Entfernen?');
      expect(patches).toBe(0);
    });

    it('unchecks without asking when the addition is empty', async () => {
      const confirm = vi.spyOn(window, 'confirm');
      const bodies: unknown[] = [];
      server.use(
        meOk,
        bookOk(sampleBook()),
        http.patch('/api/books/b1/storylines/s1', async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json(bookResponse(sampleBook()));
        }),
      );
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      await userEvent.click(await miraCheckbox());
      await vi.waitFor(() => expect(bodies).toEqual([{ characterIds: [] }]));
      expect(confirm).not.toHaveBeenCalled();
    });

    it('requests a suggestion for an expanded editor after a description change', async () => {
      let posts = 0;
      server.use(
        meOk,
        bookOk(sampleBook()),
        http.patch('/api/books/b1/storylines/s1', () => HttpResponse.json(bookResponse(sampleBook()))),
        http.post('/api/books/b1/storylines/s1/characters/c1/suggestion', async ({ request }) => {
          expect(await request.json()).toEqual({});
          posts += 1;
          return HttpResponse.json({ behavior: 'vorsichtig', intentions: 'Flucht' });
        }),
      );
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      await userEvent.type(await screen.findByLabelText('Kurzbeschreibung'), 'Neu');
      await userEvent.tab();
      await new Promise((r) => setTimeout(r, 50));
      expect(posts).toBe(0);
      await userEvent.click(screen.getByRole('button', { name: toggleName }));
      await userEvent.type(screen.getByLabelText('Kurzbeschreibung'), '!');
      await userEvent.tab();
      await vi.waitFor(() => expect(posts).toBe(1));
      expect(await screen.findByText('vorsichtig')).toBeInTheDocument();
    });

    it.each([
      ['pending', 'Prüfe Figuren…'],
      ['running', 'Prüfe Figuren…'],
      ['failed', 'Prüfung fehlgeschlagen'],
    ] as const)('shows the %s check status', async (status, text) => {
      const checks = [{ storylineId: 's1', status, finishedAt: null, error: null }];
      server.use(meOk, bookOk(sampleBook(), { characterChecks: checks }));
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
    });

    it('shows how long ago the check finished', async () => {
      const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
      const checks = [{ storylineId: 's1', status: 'done' as const, finishedAt: ago(3 * 60_000 + 5000), error: null }];
      server.use(meOk, bookOk(sampleBook(), { characterChecks: checks }));
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      expect(await screen.findByText('Geprüft vor 3 min')).toBeInTheDocument();
    });

    it('says „gerade eben“ for a check under a minute old', async () => {
      const checks = [{ storylineId: 's1', status: 'done' as const, finishedAt: new Date().toISOString(), error: null }];
      server.use(meOk, bookOk(sampleBook(), { characterChecks: checks }));
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      expect(await screen.findByText('Geprüft gerade eben')).toBeInTheDocument();
    });

    it('posts the check route from the button and from the failed link', async () => {
      let posts = 0;
      const checks = [{ storylineId: 's1', status: 'failed' as const, finishedAt: null, error: 'x' }];
      server.use(
        meOk,
        bookOk(sampleBook(), { characterChecks: checks }),
        http.post('/api/books/b1/storylines/s1/character-check', () => {
          posts += 1;
          return HttpResponse.json(bookResponse(sampleBook(), { characterChecks: checks }));
        }),
      );
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      await userEvent.click(await screen.findByRole('button', { name: 'Figuren prüfen' }));
      await vi.waitFor(() => expect(posts).toBe(1));
      await userEvent.click(screen.getByRole('button', { name: 'erneut versuchen' }));
      await vi.waitFor(() => expect(posts).toBe(2));
    });

    it('shows only the button when no status row exists, and a disabled one when AI is off', async () => {
      server.use(meOk, bookOk(sampleBook()));
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      expect(await screen.findByRole('button', { name: 'Figuren prüfen' })).toBeEnabled();
      expect(screen.queryByText(/Prüfe Figuren|Geprüft/)).not.toBeInTheDocument();
    });

    it('disables the check when AI is not set up', async () => {
      server.use(meOk, bookOk(sampleBook(), { ai: { enabled: false } }));
      renderApp('/books/b1');
      await openStoryline('Hauptstrang');
      expect(await screen.findByText('KI nicht eingerichtet')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Figuren prüfen' })).toBeDisabled();
    });
  });
});
