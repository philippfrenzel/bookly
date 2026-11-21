/** Tests for the scene tab: create, rename, notes, image upload and delete (AC-001, AC-002). */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookOk, bookResponse, meOk } from '../book/testFixtures';
import { renderApp } from '../test/render';
import { server } from '../test/setup';
import { assignment, bookWithSections, scene } from './sceneTestFixtures';

async function openTab() {
  renderApp('/books/b1');
  await userEvent.click(await screen.findByRole('tab', { name: 'Szenen' }));
}

afterEach(() => vi.restoreAllMocks());

describe('ScenePanel', () => {
  it('shows a guiding empty state and creates a scene', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(bookWithSections()),
      http.post('/api/books/b1/scenes', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(bookWithSections(), { scenes: [scene({ name: 'Neue Szene' })] }), { status: 201 });
      }),
    );
    await openTab();
    expect(screen.getByText(/Lege Szenen an/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Szene' }));
    expect(bodies).toEqual([{ name: 'Neue Szene' }]);
    expect(await screen.findByLabelText('Name Szene Neue Szene')).toBeInTheDocument();
  });

  it('renames on blur, keeps the old name when emptied, and lists the sections it is assigned to', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(bookWithSections(), { scenes: [scene()], sceneAssignments: [assignment()] }),
      http.patch('/api/books/b1/scenes/sc1', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(bookResponse(bookWithSections(), { scenes: [scene({ name: 'Alpensee' })] }));
      }),
    );
    await openTab();
    expect(screen.getByRole('button', { name: 'Abschnitt „Ankunft“ öffnen' })).toBeInTheDocument();
    const name = screen.getByLabelText('Name Szene Bergsee');
    await userEvent.clear(name);
    await userEvent.tab();
    expect(name).toHaveValue('Bergsee');
    await userEvent.clear(name);
    await userEvent.type(name, 'Alpensee');
    await userEvent.tab();
    expect(bodies).toEqual([{ name: 'Alpensee' }]);
  });

  it('opens an assigned section in its storyline and returns to the scene tab', async () => {
    server.use(meOk, bookOk(bookWithSections(), { scenes: [scene()], sceneAssignments: [assignment({ sectionId: 'sec2' })] }));
    await openTab();
    await userEvent.click(screen.getByRole('button', { name: 'Abschnitt „Abschied“ öffnen' }));
    expect(screen.getByRole('tab', { name: 'Zeitpunkte', selected: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Titel Abschied')).toHaveValue('Abschied');
    expect(screen.getByRole('group', { name: 'Szenen' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zurück zum Buch' }));
    expect(screen.getByRole('tab', { name: 'Szenen', selected: true })).toBeInTheDocument();
  });

  it('adds, edits and deletes notes', async () => {
    const calls: string[] = [];
    const withNote = scene({ notes: [{ id: 'n1', text: '' }] });
    server.use(
      meOk,
      bookOk(bookWithSections(), { scenes: [scene()] }),
      http.post('/api/books/b1/scenes/sc1/notes', () => {
        calls.push('add');
        return HttpResponse.json(bookResponse(bookWithSections(), { scenes: [withNote] }), { status: 201 });
      }),
      http.patch('/api/books/b1/scenes/sc1/notes/n1', async ({ request }) => {
        calls.push(`edit:${(await request.json() as { text: string }).text}`);
        return HttpResponse.json(bookResponse(bookWithSections(), { scenes: [scene({ notes: [{ id: 'n1', text: 'Nebel' }] })] }));
      }),
      http.delete('/api/books/b1/scenes/sc1/notes/n1', () => {
        calls.push('delete');
        return HttpResponse.json(bookResponse(bookWithSections(), { scenes: [scene()] }));
      }),
    );
    await openTab();
    await userEvent.click(screen.getByRole('button', { name: 'Notiz zur Szene „Bergsee“ hinzufügen' }));
    await userEvent.type(await screen.findByLabelText('Notiz 1 Szene Bergsee'), 'Nebel');
    await userEvent.tab();
    await userEvent.click(await screen.findByRole('button', { name: 'Notiz 1 der Szene „Bergsee“ löschen' }));
    expect(calls).toEqual(['add', 'edit:Nebel', 'delete']);
  });

  it('uploads an image as raw body and shows it', async () => {
    let received: string | null = null;
    const image = { mime: 'image/png' as const, size: 4, version: '2026-11-21T00:00:00.000Z' };
    server.use(
      meOk,
      bookOk(bookWithSections(), { scenes: [scene()] }),
      http.put('/api/books/b1/scenes/sc1/image', async ({ request }) => {
        received = request.headers.get('content-type');
        return HttpResponse.json(bookResponse(bookWithSections(), { scenes: [scene({ image })] }));
      }),
    );
    await openTab();
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'see.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Bild für Szene Bergsee wählen'), file);
    const img = await screen.findByRole('img', { name: 'Bild der Szene Bergsee' });
    expect(img).toHaveAttribute('src', `/api/books/b1/scenes/sc1/image?v=${encodeURIComponent(image.version)}`);
    // jsdom cannot serialise a File body, so only the declared type is checked here; the server tests cover the bytes.
    expect(received).toBe('image/png');
  });

  it('refuses a wrong file type before sending', async () => {
    server.use(meOk, bookOk(bookWithSections(), { scenes: [scene()] }));
    await openTab();
    const file = new File(['x'], 'see.gif', { type: 'image/gif' });
    await userEvent.upload(screen.getByLabelText('Bild für Szene Bergsee wählen'), file, { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('Nur JPEG-, PNG- oder WebP-Bilder.');
  });

  it('deletes after confirmation, naming the assignments that go with it', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deletes = 0;
    server.use(
      meOk,
      bookOk(bookWithSections(), { scenes: [scene()], sceneAssignments: [assignment()] }),
      http.delete('/api/books/b1/scenes/sc1', () => {
        deletes += 1;
        return HttpResponse.json(bookResponse(bookWithSections()));
      }),
    );
    await openTab();
    await userEvent.click(screen.getByRole('button', { name: 'Szene „Bergsee“ löschen' }));
    expect(confirm).toHaveBeenCalledWith('Szene „Bergsee“ löschen? Sie wird aus 1 Abschnitt(en) entfernt.');
    expect(deletes).toBe(1);
  });
});
