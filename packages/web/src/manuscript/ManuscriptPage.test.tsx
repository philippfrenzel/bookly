/** Tests for the manuscript page: AI proposal decision, editing under a lock, lock badge and unlock, reviewer rights. */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { ManuscriptBlock, ManuscriptResponse } from '@bookly/shared';
import { REVIEWER_RIGHTS } from '@bookly/shared';
import { meOk } from '../book/testFixtures';
import { renderApp } from '../test/render';
import { server } from '../test/setup';

function block(over: Partial<ManuscriptBlock> = {}): ManuscriptBlock {
  return {
    id: 'k1', chapterId: 'c1', position: 0, title: 'Ankunft', synopsis: 'Mira erreicht den See.', text: 'Es war still.',
    version: 1, sectionId: null, storylineId: 's1', sceneIds: [], instruction: '', comments: [], suggestions: [], lock: null, updatedAt: '2026-11-21T10:00:00Z', ...over,
  };
}

function manuscript(over: Partial<ManuscriptResponse> = {}): ManuscriptResponse {
  return {
    book: { id: 'b1', title: 'Sturmland' },
    role: 'author',
    rights: [...REVIEWER_RIGHTS],
    chapters: [{ id: 'c1', position: 0, title: 'Aufbruch', blocks: [block()] }],
    trash: [],
    proposals: [],
    reviewers: [],
    context: { storylines: [{ id: 's1', title: 'Hauptstrang', color: '#2B59C3' }], sections: [], scenes: [] },
    ai: { enabled: true },
    ...over,
  };
}

const msOk = (ms: ManuscriptResponse) => http.get('/api/books/b1/manuscript', () => HttpResponse.json(ms));

describe('ManuscriptPage', () => {
  it('asks the AI for a structure and applies it only when the author accepts', async () => {
    const proposal = {
      id: 'p1', kind: 'initial' as const, summary: 'Ein Kapitel pro Strang.', createdAt: '2026-11-21T10:00:00Z',
      chapters: [{ chapterId: null, title: 'Kapitel 1', reason: 'Folgt der Reise.', blocks: [{ blockId: null, title: 'Ankunft', synopsis: '', sectionId: null, storylineId: 's1', sceneIds: [] }] }],
    };
    const calls: string[] = [];
    server.use(
      meOk,
      msOk(manuscript({ chapters: [] })),
      http.post('/api/books/b1/manuscript/proposals', () => {
        calls.push('propose');
        return HttpResponse.json(manuscript({ chapters: [], proposals: [proposal] }), { status: 201 });
      }),
      http.post('/api/books/b1/manuscript/proposals/p1/accept', () => {
        calls.push('accept');
        return HttpResponse.json(manuscript({ chapters: [{ id: 'c9', position: 0, title: 'Kapitel 1', blocks: [block({ chapterId: 'c9' })] }] }));
      }),
    );
    renderApp('/books/b1/manuskript');
    expect(await screen.findByText('Dein Buch wartet auf seine Kapitel.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Struktur vorschlagen' }));
    const view = await screen.findByRole('article', { name: 'KI-Vorschlag' });
    expect(within(view).getByText('Folgt der Reise.')).toBeInTheDocument();
    expect(within(view).getByText('neu', { selector: '.ms-change' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Kapitel 1' })).not.toBeInTheDocument();
    await userEvent.click(within(view).getByRole('button', { name: 'Übernehmen' }));
    expect(await screen.findByRole('heading', { name: 'Kapitel 1' })).toBeInTheDocument();
    expect(calls).toEqual(['propose', 'accept']);
  });

  it('takes the lock before editing and saves a new version from the current one', async () => {
    const bodies: unknown[] = [];
    const locked = manuscript({ chapters: [{ id: 'c1', position: 0, title: 'Aufbruch', blocks: [block({ lock: { mine: true, expiresAt: '2026-11-21T10:30:00Z' } })] }] });
    server.use(
      meOk,
      msOk(manuscript()),
      http.post('/api/books/b1/manuscript/blocks/k1/lock', () => HttpResponse.json(locked)),
      http.patch('/api/books/b1/manuscript/blocks/k1', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(manuscript({ chapters: [{ id: 'c1', position: 0, title: 'Aufbruch', blocks: [block({ text: 'Neu.', version: 2, lock: { mine: true, expiresAt: '2026-11-21T10:30:00Z' } })] }] }));
      }),
      http.delete('/api/books/b1/manuscript/blocks/k1/lock', () => HttpResponse.json(manuscript({ chapters: [{ id: 'c1', position: 0, title: 'Aufbruch', blocks: [block({ text: 'Neu.', version: 2 })] }] }))),
    );
    renderApp('/books/b1/manuskript');
    await userEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    const editor = await screen.findByRole('form', { name: 'Baustein Ankunft bearbeiten' });
    expect(within(editor).getByText(/Für andere gesperrt bis/)).toBeInTheDocument();
    const text = within(editor).getByLabelText('Text');
    await userEvent.clear(text);
    await userEvent.type(text, 'Neu.');
    await userEvent.click(within(editor).getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Neu.')).toBeInTheDocument();
    expect(bodies).toEqual([{ baseVersion: 1, title: 'Ankunft', synopsis: 'Mira erreicht den See.', text: 'Neu.' }]);
  });

  it('shows a foreign lock only as locked; the author can release it', async () => {
    server.use(
      meOk,
      msOk(manuscript({ chapters: [{ id: 'c1', position: 0, title: 'Aufbruch', blocks: [block({ lock: { mine: false, expiresAt: '2026-11-21T10:30:00Z' } })] }] })),
      http.delete('/api/books/b1/manuscript/blocks/k1/lock', () => HttpResponse.json(manuscript())),
    );
    renderApp('/books/b1/manuskript');
    const card = await screen.findByRole('listitem', { name: 'Baustein Ankunft' });
    expect(within(card).getByRole('status')).toHaveTextContent('Gesperrt');
    expect(within(card).getByRole('button', { name: 'Bearbeiten' })).toBeDisabled();
    await userEvent.click(within(card).getByRole('button', { name: 'Sperre aufheben' }));
    expect(await within(card).findByRole('button', { name: 'Bearbeiten' })).toBeEnabled();
    expect(within(card).queryByRole('status')).not.toBeInTheDocument();
  });

  it('tells the user when the block got locked meanwhile', async () => {
    server.use(
      meOk,
      msOk(manuscript()),
      http.post('/api/books/b1/manuscript/blocks/k1/lock', () => HttpResponse.json({ error: 'locked' }, { status: 423 })),
    );
    renderApp('/books/b1/manuskript');
    await userEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dieser Baustein wird gerade bearbeitet.');
  });

  it('a reviewer with read right only sees no editing tools and no author tabs', async () => {
    server.use(meOk, msOk(manuscript({ role: 'reviewer', rights: ['read'] })));
    renderApp('/books/b1/manuskript');
    expect(await screen.findByText('Es war still.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Baustein löschen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kapitel hinzufügen' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Papierkorb']);
  });

  it('the author invites a reviewer with chosen rights', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      msOk(manuscript()),
      http.post('/api/books/b1/manuscript/reviewers', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ error: 'user_not_found' }, { status: 404 });
      }),
    );
    renderApp('/books/b1/manuskript');
    await userEvent.click(await screen.findByRole('tab', { name: 'Lektoren' }));
    expect(screen.getByText('0 von 5')).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Lektor einladen' });
    await userEvent.type(within(form).getByLabelText('E-Mail des Lektors'), 'lektor@example.de');
    await userEvent.click(within(form).getByLabelText('Direkt bearbeiten'));
    await userEvent.click(within(form).getByRole('button', { name: 'Einladen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('kein Konto');
    expect(bodies).toEqual([{ email: 'lektor@example.de', rights: ['read', 'comment', 'suggest', 'edit'] }]);
  });

  it('a reviewer with only the suggest right sends a suggestion; the author accepts it', async () => {
    const bodies: unknown[] = [];
    const sug = { id: 'g1', authorName: 'Lena', mine: false, baseVersion: 1, title: 'Ankunft', synopsis: 'Mira erreicht den See.', text: 'Kürzer.', note: 'straffen', createdAt: '2026-11-21T10:00:00Z' };
    server.use(
      meOk,
      msOk(manuscript({ role: 'reviewer', rights: ['read', 'suggest'] })),
      http.post('/api/books/b1/manuscript/blocks/k1/suggestions', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(manuscript({ role: 'reviewer', rights: ['read', 'suggest'], chapters: [{ id: 'c1', position: 0, title: 'Aufbruch', blocks: [block({ suggestions: [{ ...sug, mine: true }] })] }] }), { status: 201 });
      }),
    );
    const view = renderApp('/books/b1/manuskript');
    await userEvent.click(await screen.findByRole('button', { name: 'Vorschlag machen' }));
    const form = screen.getByRole('form', { name: 'Vorschlag für Ankunft' });
    const text = within(form).getByLabelText('Text');
    await userEvent.clear(text);
    await userEvent.type(text, 'Kürzer.');
    await userEvent.type(within(form).getByLabelText('Notiz an den Autor (optional)'), 'straffen');
    await userEvent.click(within(form).getByRole('button', { name: 'Vorschlag senden' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Dein Vorschlag ist beim Autor');
    expect(screen.getByRole('button', { name: 'Zurückziehen' })).toBeInTheDocument();
    expect(bodies).toEqual([{ baseVersion: 1, title: 'Ankunft', synopsis: 'Mira erreicht den See.', text: 'Kürzer.', note: 'straffen' }]);
    view.unmount();

    const decided: string[] = [];
    server.use(
      msOk(manuscript({ chapters: [{ id: 'c1', position: 0, title: 'Aufbruch', blocks: [block({ suggestions: [sug] })] }] })),
      http.post('/api/books/b1/manuscript/blocks/k1/suggestions/g1/accept', () => {
        decided.push('accept');
        return HttpResponse.json(manuscript({ chapters: [{ id: 'c1', position: 0, title: 'Aufbruch', blocks: [block({ text: 'Kürzer.', version: 2 })] }] }));
      }),
    );
    renderApp('/books/b1/manuskript');
    const card = await screen.findByRole('article', { name: 'Vorschlag von Lena' });
    expect(within(card).getByText('„straffen“')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Übernehmen' }));
    expect(await screen.findByText('Kürzer.')).toBeInTheDocument();
    expect(decided).toEqual(['accept']);
  });

  it('comments are written with the comment right', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      msOk(manuscript({ role: 'reviewer', rights: ['read', 'comment'] })),
      http.post('/api/books/b1/manuscript/blocks/k1/comments', async ({ request }) => {
        bodies.push(await request.json());
        const comments = [{ id: 'm1', authorName: 'Lena', mine: true, text: 'Schöner Einstieg', createdAt: '2026-11-21T10:00:00Z' }];
        return HttpResponse.json(manuscript({ role: 'reviewer', rights: ['read', 'comment'], chapters: [{ id: 'c1', position: 0, title: 'Aufbruch', blocks: [block({ comments })] }] }), { status: 201 });
      }),
    );
    renderApp('/books/b1/manuskript');
    await userEvent.click(await screen.findByRole('button', { name: 'Kommentieren' }));
    await userEvent.type(screen.getByLabelText('Neuer Kommentar'), 'Schöner Einstieg');
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }));
    expect(await screen.findByText('Schöner Einstieg')).toBeInTheDocument();
    expect(bodies).toEqual([{ text: 'Schöner Einstieg' }]);
  });

  it('locks a whole chapter and opens every editor in it', async () => {
    const mine = { mine: true, expiresAt: '2026-11-21T10:30:00Z' };
    const two = (lock: typeof mine | null) => [block({ lock }), block({ id: 'k2', title: 'Abschied', position: 1, lock })];
    server.use(
      meOk,
      msOk(manuscript({ chapters: [{ id: 'c1', position: 0, title: 'Aufbruch', blocks: two(null) }] })),
      http.post('/api/books/b1/manuscript/chapters/c1/lock', () => HttpResponse.json(manuscript({ chapters: [{ id: 'c1', position: 0, title: 'Aufbruch', blocks: two(mine) }] }))),
    );
    renderApp('/books/b1/manuskript');
    await userEvent.click(await screen.findByRole('button', { name: 'Kapitel bearbeiten' }));
    expect(await screen.findByRole('form', { name: 'Baustein Ankunft bearbeiten' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Baustein Abschied bearbeiten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kapitel freigeben' })).toBeInTheDocument();
  });

  it('shows the whole work or one chapter as a reading preview', async () => {
    server.use(meOk, msOk(manuscript({ chapters: [
      { id: 'c1', position: 0, title: 'Aufbruch', blocks: [block({ text: 'Erster Absatz.\n\nZweiter Absatz.' })] },
      { id: 'c2', position: 1, title: 'Sturm', blocks: [block({ id: 'k2', chapterId: 'c2', text: 'Regen.' })] },
    ] })));
    const view = renderApp('/books/b1/manuskript/vorschau');
    const paper = await screen.findByRole('article', { name: 'Vorschau' });
    expect(within(paper).getByRole('heading', { name: 'Sturmland' })).toBeInTheDocument();
    expect(within(paper).getByText('Zweiter Absatz.')).toBeInTheDocument();
    expect(within(paper).getByText('Regen.')).toBeInTheDocument();
    view.unmount();
    renderApp('/books/b1/manuskript/vorschau?kapitel=c2');
    const one = await screen.findByRole('article', { name: 'Vorschau' });
    expect(within(one).getByText('Regen.')).toBeInTheDocument();
    expect(within(one).queryByText('Zweiter Absatz.')).not.toBeInTheDocument();
  });
});
