/** Tests for scenes inside a section: assign with earlier descriptions, generate, change, remove (AC-003, AC-005, AC-006). */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { BookResponse } from '@bookly/shared';
import { bookOk, bookResponse, meOk } from '../book/testFixtures';
import { renderApp } from '../test/render';
import { server } from '../test/setup';
import { assignment, bookWithSections, bookWithSideStrand, scene } from './sceneTestFixtures';

/** Opens the storyline, its „Zeitpunkte“ tab and the edit form of section „Abschied“ (sec2). */
async function openSection(name = 'Abschied') {
  renderApp('/books/b1');
  await userEvent.click(await screen.findByRole('button', { name: 'Storyline „Hauptstrang“' }));
  await userEvent.click(await screen.findByRole('tab', { name: 'Zeitpunkte' }));
  await userEvent.click(await screen.findByRole('button', { name: `Abschnitt „${name}“ bearbeiten` }));
  return screen.getByRole('group', { name: 'Szenen' });
}

const withNote = scene({ notes: [{ id: 'n1', text: 'Nebel' }] });

describe('SceneAssignments', () => {
  it('first assignment starts empty and is saved with the typed description (HDR-001)', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(bookWithSections(), { scenes: [scene()] }),
      http.post('/api/books/b1/scene-assignments', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(bookWithSections(), { scenes: [scene()], sceneAssignments: [assignment({ sectionId: 'sec2', description: 'Ein See.' })] }), { status: 201 });
      }),
    );
    const block = await openSection();
    await userEvent.selectOptions(within(block).getByLabelText('Szene zuordnen'), 'sc1');
    expect(within(block).getByText('Diese Szene hat noch keine Beschreibung.')).toBeInTheDocument();
    const text = within(block).getByLabelText('Beschreibung der neuen Zuordnung');
    expect(text).toHaveValue('');
    expect(within(block).getByRole('button', { name: 'Beschreibung erzeugen' })).toBeDisabled();
    await userEvent.type(text, 'Ein See.');
    await userEvent.click(within(block).getByRole('button', { name: 'Zuordnen' }));
    expect(bodies).toEqual([{ sceneId: 'sc1', description: 'Ein See.', sectionId: 'sec2' }]);
    expect(await within(block).findByLabelText('Block 1 Szene Bergsee')).toHaveValue('Ein See.');
  });

  it('inserts the latest earlier description and offers the list when there are several (FR-005)', async () => {
    const earlier = [
      assignment({ id: 'a1', sectionId: 'sec1', description: 'Alt', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const book = bookWithSections();
    book.storylines[0]!.sections.push({ id: 'sec3', storylineId: 's1', title: 'Rückkehr', description: '', characterIds: [], range: { startId: 't3', endId: 't3' }, note: null, order: 2 });
    server.use(meOk, bookOk(book, {
      scenes: [scene()],
      sceneAssignments: [...earlier, assignment({ id: 'a2', sectionId: 'sec2', description: 'Neu', updatedAt: '2026-02-01T00:00:00.000Z' })],
    }));
    const block = await openSection('Rückkehr');
    await userEvent.selectOptions(within(block).getByLabelText('Szene zuordnen'), 'sc1');
    const text = within(block).getByLabelText('Beschreibung der neuen Zuordnung');
    expect(text).toHaveValue('Neu');
    await userEvent.selectOptions(within(block).getByLabelText('Bisherige Beschreibung wählen'), '1');
    expect(text).toHaveValue('Alt');
  });

  it('generates a description on click only and puts it into the field (FR-006)', async () => {
    let calls = 0;
    server.use(
      meOk,
      bookOk(bookWithSections(), { scenes: [withNote] }),
      http.post('/api/books/b1/scenes/sc1/description', async ({ request }) => {
        calls += 1;
        expect(await request.json()).toEqual({ sectionId: 'sec2' });
        return HttpResponse.json({ description: 'Nebel liegt über dem See.' });
      }),
    );
    const block = await openSection();
    await userEvent.selectOptions(within(block).getByLabelText('Szene zuordnen'), 'sc1');
    expect(calls).toBe(0);
    await userEvent.click(within(block).getByRole('button', { name: 'Beschreibung erzeugen' }));
    expect(await within(block).findByDisplayValue('Nebel liegt über dem See.')).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it('regenerating an assigned description needs „Übernehmen“ before it is saved', async () => {
    const patches: unknown[] = [];
    const extra: Partial<Omit<BookResponse, 'book'>> = { scenes: [withNote], sceneAssignments: [assignment({ sectionId: 'sec2', description: 'Alt' })] };
    server.use(
      meOk,
      bookOk(bookWithSections(), extra),
      http.post('/api/books/b1/scenes/sc1/description', () => HttpResponse.json({ description: 'Frisch' })),
      http.patch('/api/books/b1/scene-assignments/a1', async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json(bookResponse(bookWithSections(), { ...extra, sceneAssignments: [assignment({ sectionId: 'sec2', description: 'Frisch' })] }));
      }),
    );
    const block = await openSection();
    expect(within(block).getByLabelText('Block 1 Szene Bergsee')).toHaveValue('Alt');
    await userEvent.click(within(block).getByRole('button', { name: 'Neu erzeugen' }));
    expect(await within(block).findByDisplayValue('Frisch')).toBe(within(block).getByLabelText('Beschreibung Szene Bergsee'));
    await userEvent.click(within(block).getByRole('button', { name: 'Verwerfen' }));
    expect(within(block).getByLabelText('Block 1 Szene Bergsee')).toHaveValue('Alt');
    await userEvent.click(within(block).getByRole('button', { name: 'Neu erzeugen' }));
    await userEvent.click(await within(block).findByRole('button', { name: 'Übernehmen' }));
    expect(patches).toEqual([{ description: 'Frisch', revision: 0 }]);
  });

  it('saves an edited block on blur and removes an assignment (AC-003)', async () => {
    const calls: string[] = [];
    const extra = { scenes: [scene()], sceneAssignments: [assignment({ sectionId: 'sec2', description: 'Alt' })] };
    server.use(
      meOk,
      bookOk(bookWithSections(), extra),
      http.put('/api/books/b1/scene-assignments/a1/blocks', async ({ request }) => {
        calls.push(`put:${JSON.stringify(await request.json())}`);
        return HttpResponse.json(bookResponse(bookWithSections(), extra));
      }),
      http.delete('/api/books/b1/scene-assignments/a1', () => {
        calls.push('delete');
        return HttpResponse.json(bookResponse(bookWithSections(), { scenes: [scene()] }));
      }),
    );
    const block = await openSection();
    await userEvent.type(within(block).getByLabelText('Block 1 Szene Bergsee'), ' und still');
    await userEvent.tab();
    await userEvent.click(within(block).getByRole('button', { name: 'Szene „Bergsee“ aus diesem Abschnitt entfernen' }));
    expect(calls).toEqual(['put:{"revision":0,"blocks":[{"id":"blk1","text":"Alt und still"}]}', 'delete']);
  });

  it('shows why generating is not possible without AI', async () => {
    server.use(meOk, bookOk(bookWithSections(), { scenes: [withNote], ai: { enabled: false } }));
    const block = await openSection();
    await userEvent.selectOptions(within(block).getByLabelText('Szene zuordnen'), 'sc1');
    expect(within(block).getByRole('button', { name: 'Beschreibung erzeugen' })).toBeDisabled();
    expect(within(block).getByText('KI nicht eingerichtet.')).toBeInTheDocument();
  });
  it('offers earlier descriptions for an existing assignment as a proposal (FR-005)', async () => {
    const patches: unknown[] = [];
    const extra = {
      scenes: [scene()],
      sceneAssignments: [
        assignment({ id: 'a1', sectionId: 'sec1', description: 'Morgennebel', updatedAt: '2026-01-01T00:00:00.000Z' }),
        assignment({ id: 'a2', sectionId: 'sec2', description: 'Alt', updatedAt: '2026-02-01T00:00:00.000Z' }),
      ],
    };
    server.use(
      meOk,
      bookOk(bookWithSections(), extra),
      http.patch('/api/books/b1/scene-assignments/a2', async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json(bookResponse(bookWithSections(), extra));
      }),
    );
    const block = await openSection();
    const pick = within(block).getByLabelText('Frühere Beschreibung für Szene Bergsee einsetzen');
    expect(within(pick).getAllByRole('option').map((o) => o.textContent)).toEqual(['Frühere Beschreibung einsetzen …', 'Morgennebel']);
    await userEvent.selectOptions(pick, '0');
    expect(within(block).getByLabelText('Beschreibung Szene Bergsee')).toHaveValue('Morgennebel');
    await userEvent.click(within(block).getByRole('button', { name: 'Verwerfen' }));
    expect(within(block).getByLabelText('Block 1 Szene Bergsee')).toHaveValue('Alt');
    await userEvent.selectOptions(within(block).getByLabelText('Frühere Beschreibung für Szene Bergsee einsetzen'), '0');
    await userEvent.click(within(block).getByRole('button', { name: 'Übernehmen' }));
    expect(patches).toEqual([{ description: 'Morgennebel', revision: 0 }]);
  });

  it('a stale „Übernehmen“ shows the message and reloads the book', async () => {
    let gets = 0;
    const extra = { scenes: [withNote], sceneAssignments: [assignment({ sectionId: 'sec2', description: 'Alt' })] };
    server.use(
      meOk,
      http.get('/api/books/b1', () => {
        gets += 1;
        return HttpResponse.json(bookResponse(bookWithSections(), extra));
      }),
      http.post('/api/books/b1/scenes/sc1/description', () => HttpResponse.json({ description: 'Frisch' })),
      http.patch('/api/books/b1/scene-assignments/a1', () => HttpResponse.json({ error: 'stale' }, { status: 409 })),
    );
    const block = await openSection();
    const before = gets;
    await userEvent.click(within(block).getByRole('button', { name: 'Neu erzeugen' }));
    await userEvent.click(await within(block).findByRole('button', { name: 'Übernehmen' }));
    expect(await within(block).findByRole('alert')).toHaveTextContent('Die Szene wurde inzwischen geändert. Der aktuelle Stand ist geladen.');
    await waitFor(() => expect(gets).toBeGreaterThan(before));
    expect(within(block).queryByText('Speichern fehlgeschlagen. Bitte erneut versuchen.')).not.toBeInTheDocument();
  });

  it('moves an assignment to another section that does not hold the scene yet (AC-003)', async () => {
    const patches: unknown[] = [];
    const book = bookWithSections();
    book.storylines[0]!.sections.push({ id: 'sec3', storylineId: 's1', title: 'Rückkehr', description: '', characterIds: [], range: { startId: 't3', endId: 't3' }, note: null, order: 2 });
    const extra = { scenes: [scene()], sceneAssignments: [assignment({ id: 'a1', sectionId: 'sec1' }), assignment({ id: 'a2', sectionId: 'sec2', description: 'See' })] };
    server.use(
      meOk,
      bookOk(book, extra),
      http.patch('/api/books/b1/scene-assignments/a2', async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json(bookResponse(book, { ...extra, sceneAssignments: [extra.sceneAssignments[0]!, assignment({ id: 'a2', sectionId: 'sec3', description: 'See' })] }));
      }),
    );
    const block = await openSection();
    const move = within(block).getByLabelText('Szene Bergsee verschieben');
    expect(within(move).getAllByRole('option').map((o) => o.textContent)).toEqual(['Verschieben nach …', 'Ganze Storyline „Hauptstrang“', 'Rückkehr']);
    await userEvent.selectOptions(move, 'section:sec3');
    expect(patches).toEqual([{ sectionId: 'sec3' }]);
    expect(await within(block).findByLabelText('Szene zuordnen')).toBeInTheDocument();
    expect(within(block).queryByLabelText('Block 1 Szene Bergsee')).not.toBeInTheDocument();
  });
  it('assigns a scene to a side strand in its „Szenen“ tab, starting with the latest description (FR-005)', async () => {
    const bodies: unknown[] = [];
    const book = bookWithSideStrand();
    const extra = { scenes: [withNote], sceneAssignments: [assignment({ sectionId: 'sec1', description: 'Morgennebel' })] };
    server.use(
      meOk,
      bookOk(book, extra),
      http.post('/api/books/b1/scene-assignments', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(book, { ...extra, sceneAssignments: [...extra.sceneAssignments, assignment({ id: 'a2', sectionId: null, storylineId: 's2', description: 'Morgennebel' })] }), { status: 201 });
      }),
    );
    renderApp('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Storyline „Erinnerung“' }));
    expect(screen.queryByRole('tab', { name: 'Zeitpunkte' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('tab', { name: 'Szenen' }));
    const block = screen.getByRole('group', { name: 'Szenen' });
    await userEvent.selectOptions(within(block).getByLabelText('Szene zuordnen'), 'sc1');
    expect(within(block).getByLabelText('Beschreibung der neuen Zuordnung')).toHaveValue('Morgennebel');
    await userEvent.click(within(block).getByRole('button', { name: 'Zuordnen' }));
    expect(bodies).toEqual([{ sceneId: 'sc1', description: 'Morgennebel', storylineId: 's2' }]);
    expect(await within(block).findByLabelText('Block 1 Szene Bergsee')).toHaveValue('Morgennebel');
  });

  it('assigns with a prefilled earlier description longer than 2000 characters in full', async () => {
    const bodies: { description: string }[] = [];
    const long = `${'a'.repeat(1500)}\n\n${'b'.repeat(1500)}`;
    const extra = { scenes: [scene()], sceneAssignments: [assignment({ sectionId: 'sec1', description: long })] };
    server.use(
      meOk,
      bookOk(bookWithSections(), extra),
      http.post('/api/books/b1/scene-assignments', async ({ request }) => {
        bodies.push((await request.json()) as { description: string });
        return HttpResponse.json(bookResponse(bookWithSections(), extra), { status: 201 });
      }),
    );
    const block = await openSection();
    await userEvent.selectOptions(within(block).getByLabelText('Szene zuordnen'), 'sc1');
    const text = within(block).getByLabelText('Beschreibung der neuen Zuordnung');
    expect(text).toHaveValue(long);
    expect(text).not.toHaveAttribute('maxlength');
    await userEvent.click(within(block).getByRole('button', { name: 'Zuordnen' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]!.description).toBe(long);
  });

  it('says that „Übernehmen“ replaces the whole scene text only while a proposal is open; the proposal is not cut at 2000', async () => {
    const hint = 'Übernehmen ersetzt den ganzen Szenentext (alle Blöcke) durch diesen Text.';
    const long = 'x'.repeat(2500);
    const extra = {
      scenes: [scene()],
      sceneAssignments: [
        assignment({ id: 'a1', sectionId: 'sec1', description: long, updatedAt: '2026-01-01T00:00:00.000Z' }),
        assignment({ id: 'a2', sectionId: 'sec2', description: 'Alt', updatedAt: '2026-02-01T00:00:00.000Z' }),
      ],
    };
    server.use(meOk, bookOk(bookWithSections(), extra));
    const block = await openSection();
    expect(within(block).queryByText(hint)).not.toBeInTheDocument();
    await userEvent.selectOptions(within(block).getByLabelText('Frühere Beschreibung für Szene Bergsee einsetzen'), '0');
    expect(within(block).getByText(hint)).toHaveClass('muted');
    const proposal = within(block).getByLabelText('Beschreibung Szene Bergsee');
    expect(proposal).toHaveValue(long);
    expect(proposal).not.toHaveAttribute('maxlength');
    await userEvent.click(within(block).getByRole('button', { name: 'Verwerfen' }));
    expect(within(block).queryByText(hint)).not.toBeInTheDocument();
  });

  it('shows the wand icon on „Beschreibung erzeugen“ in the section form', async () => {
    server.use(meOk, bookOk(bookWithSections(), { scenes: [withNote] }));
    const block = await openSection();
    await userEvent.selectOptions(within(block).getByLabelText('Szene zuordnen'), 'sc1');
    const button = within(block).getByRole('button', { name: 'Beschreibung erzeugen' });
    expect(button).toHaveClass('with-icon');
    expect(button.querySelector('svg.icon')).not.toBeNull();
  });

  it('shows the wand icon on „Beschreibung erzeugen“ in a side strand „Szenen“ tab', async () => {
    server.use(meOk, bookOk(bookWithSideStrand(), { scenes: [withNote] }));
    renderApp('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Storyline „Erinnerung“' }));
    await userEvent.click(await screen.findByRole('tab', { name: 'Szenen' }));
    const block = screen.getByRole('group', { name: 'Szenen' });
    await userEvent.selectOptions(within(block).getByLabelText('Szene zuordnen'), 'sc1');
    const button = within(block).getByRole('button', { name: 'Beschreibung erzeugen' });
    expect(button.querySelector('svg.icon')).not.toBeNull();
  });

  it('keeps the icon and disables the button while generating, then fills the field', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    server.use(
      meOk,
      bookOk(bookWithSections(), { scenes: [withNote] }),
      http.post('/api/books/b1/scenes/sc1/description', async () => {
        await gate;
        return HttpResponse.json({ description: 'Nebel liegt über dem See.' });
      }),
    );
    const block = await openSection();
    await userEvent.selectOptions(within(block).getByLabelText('Szene zuordnen'), 'sc1');
    await userEvent.click(within(block).getByRole('button', { name: 'Beschreibung erzeugen' }));
    const pending = await within(block).findByRole('button', { name: 'Erzeuge …' });
    expect(pending).toBeDisabled();
    expect(pending.querySelector('svg.icon')).not.toBeNull();
    release();
    expect(await within(block).findByDisplayValue('Nebel liegt über dem See.')).toBeInTheDocument();
    const done = within(block).getByRole('button', { name: 'Beschreibung erzeugen' });
    expect(done).toBeEnabled();
    expect(done.querySelector('svg.icon')).not.toBeNull();
  });

  it('shows the scenes of a main strand by section in its „Szenen“ tab', async () => {
    server.use(meOk, bookOk(bookWithSections(), { scenes: [scene()], sceneAssignments: [assignment({ sectionId: 'sec2' })] }));
    renderApp('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Storyline „Hauptstrang“' }));
    const tab = await screen.findByRole('tab', { name: 'Szenen' });
    expect(tab).toHaveTextContent('1');
    await userEvent.click(tab);
    expect(screen.getByRole('group', { name: 'Szenen der ganzen Storyline' })).toBeInTheDocument();
    const overview = screen.getByText('In den Abschnitten').parentElement!;
    expect(within(overview).getByText('Abschied').closest('li')).toHaveTextContent('Bergsee');
    expect(within(overview).getByText('Ankunft').closest('li')).toHaveTextContent('keine Szene');
    await userEvent.click(screen.getByRole('button', { name: '„Zeitpunkte“' }));
    expect(screen.getByRole('tab', { name: 'Zeitpunkte' })).toHaveAttribute('aria-selected', 'true');
  });
});
