/** Tests for scenes inside a section: assign with earlier descriptions, generate, change, remove (AC-003, AC-005, AC-006). */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { BookResponse } from '@bookly/shared';
import { bookOk, bookResponse, meOk } from '../book/testFixtures';
import { renderApp } from '../test/render';
import { server } from '../test/setup';
import { assignment, bookWithSections, scene } from './sceneTestFixtures';

/** Opens the storyline and the edit form of section „Abschied“ (sec2). */
async function openSection(name = 'Abschied') {
  renderApp('/books/b1');
  await userEvent.click(await screen.findByRole('button', { name: 'Storyline „Hauptstrang“' }));
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
    expect(await within(block).findByLabelText('Beschreibung Szene Bergsee')).toHaveValue('Ein See.');
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
    const field = within(block).getByLabelText('Beschreibung Szene Bergsee');
    await userEvent.click(within(block).getByRole('button', { name: 'Neu erzeugen' }));
    expect(await within(block).findByDisplayValue('Frisch')).toBe(field);
    await userEvent.click(within(block).getByRole('button', { name: 'Verwerfen' }));
    expect(field).toHaveValue('Alt');
    await userEvent.click(within(block).getByRole('button', { name: 'Neu erzeugen' }));
    await userEvent.click(await within(block).findByRole('button', { name: 'Übernehmen' }));
    expect(patches).toEqual([{ description: 'Frisch' }]);
  });

  it('saves an edited description on blur and removes an assignment (AC-003)', async () => {
    const calls: string[] = [];
    const extra = { scenes: [scene()], sceneAssignments: [assignment({ sectionId: 'sec2', description: 'Alt' })] };
    server.use(
      meOk,
      bookOk(bookWithSections(), extra),
      http.patch('/api/books/b1/scene-assignments/a1', async ({ request }) => {
        calls.push(`patch:${(await request.json() as { description: string }).description}`);
        return HttpResponse.json(bookResponse(bookWithSections(), extra));
      }),
      http.delete('/api/books/b1/scene-assignments/a1', () => {
        calls.push('delete');
        return HttpResponse.json(bookResponse(bookWithSections(), { scenes: [scene()] }));
      }),
    );
    const block = await openSection();
    await userEvent.type(within(block).getByLabelText('Beschreibung Szene Bergsee'), ' und still');
    await userEvent.tab();
    await userEvent.click(within(block).getByRole('button', { name: 'Szene „Bergsee“ aus diesem Abschnitt entfernen' }));
    expect(calls).toEqual(['patch:Alt und still', 'delete']);
  });

  it('shows why generating is not possible without AI', async () => {
    server.use(meOk, bookOk(bookWithSections(), { scenes: [withNote], ai: { enabled: false } }));
    const block = await openSection();
    await userEvent.selectOptions(within(block).getByLabelText('Szene zuordnen'), 'sc1');
    expect(within(block).getByRole('button', { name: 'Beschreibung erzeugen' })).toBeDisabled();
    expect(within(block).getByText('KI nicht eingerichtet.')).toBeInTheDocument();
  });
});
