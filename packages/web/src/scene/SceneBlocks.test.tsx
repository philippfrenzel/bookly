/**
 * Tests for the scene block editor: split at the caret, insert, undo split, remove an empty block, save on
 * blur, the per-block wand and stale saves (spec 2026-11-21-szenen-schreiben-design.md, A2–A4).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Book, SceneBlock } from '@bookly/shared';
import { joinBlocks } from '@bookly/shared';
import { bookResponse, meOk } from '../book/testFixtures';
import { renderApp } from '../test/render';
import { server } from '../test/setup';
import { assignment, bookWithSections, bookWithSideStrand, scene } from './sceneTestFixtures';

interface PutBody { revision: number; blocks: { id?: string; text: string }[] }

/**
 * A stateful fake of the book and blocks routes for assignment a1 (section „Abschied“ unless `side`).
 * `otherTab` simulates a save from another tab (new text, revision bumped).
 */
function fakeServer(initial: SceneBlock[], { side = false, beforePut }: { side?: boolean; beforePut?: () => Promise<void> } = {}) {
  const book: Book = side ? bookWithSideStrand() : bookWithSections();
  let state = { blocks: initial, revision: 0 };
  let next = 0;
  const puts: PutBody[] = [];
  const response = () => {
    const where = side ? { sectionId: null, storylineId: 's2' } : { sectionId: 'sec2' };
    const a = assignment({ ...where, blocks: state.blocks, revision: state.revision, description: joinBlocks(state.blocks.map((b) => b.text)) });
    return bookResponse(book, { scenes: [scene()], sceneAssignments: [a] });
  };
  server.use(
    meOk,
    http.get('/api/books/b1', () => HttpResponse.json(response())),
    http.put('/api/books/b1/scene-assignments/a1/blocks', async ({ request }) => {
      const body = (await request.json()) as PutBody;
      puts.push(body);
      await beforePut?.();
      if (body.revision !== state.revision) return HttpResponse.json({ error: 'stale' }, { status: 409 });
      state = { blocks: body.blocks.map((b) => ({ id: b.id ?? `new${++next}`, text: b.text })), revision: state.revision + 1 };
      return HttpResponse.json(response());
    }),
  );
  return {
    puts,
    response,
    otherTab: (blocks: SceneBlock[]) => {
      state = { blocks, revision: state.revision + 1 };
    },
  };
}

let queryClient: QueryClient;

/** Opens the edit form of section „Abschied“ and returns its scene group. */
async function openSection() {
  queryClient = renderApp('/books/b1').queryClient;
  await userEvent.click(await screen.findByRole('button', { name: 'Storyline „Hauptstrang“' }));
  await userEvent.click(await screen.findByRole('tab', { name: 'Zeitpunkte' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Abschnitt „Abschied“ bearbeiten' }));
  return screen.getByRole('group', { name: 'Szenen' });
}

const blockField = (group: HTMLElement, n: number) => within(group).getByLabelText(`Block ${n} Szene Bergsee`) as HTMLTextAreaElement;
const values = (group: HTMLElement) => within(group).queryAllByLabelText(/^Block \d+ Szene Bergsee$/).map((el) => (el as HTMLTextAreaElement).value);

/** Focuses `field` and places the caret (or a selection) the way a user would. */
function placeCaret(field: HTMLTextAreaElement, start: number, end = start) {
  act(() => {
    field.focus();
    field.setSelectionRange(start, end);
  });
  fireEvent.select(field);
}

describe('SceneBlocks', () => {
  it('splits exactly at the caret, sends the full list with the revision and undoes the split', async () => {
    const fake = fakeServer([{ id: 'b1', text: 'Mira sagt: Hallo.' }]);
    const group = await openSection();
    const split = within(group).getByRole('button', { name: 'Hier teilen' });
    expect(split).toBeDisabled();
    placeCaret(blockField(group, 1), 0);
    expect(split).toBeDisabled();
    placeCaret(blockField(group, 1), 17);
    expect(split).toBeDisabled();
    placeCaret(blockField(group, 1), 5, 9);
    expect(split).toBeDisabled();
    placeCaret(blockField(group, 1), 11);
    expect(split).toBeEnabled();
    await userEvent.click(split);
    await waitFor(() => expect(values(group)).toEqual(['Mira sagt: ', 'Hallo.']));
    expect(fake.puts).toEqual([{ revision: 0, blocks: [{ id: 'b1', text: 'Mira sagt: ' }, { text: 'Hallo.' }] }]);
    await userEvent.click(within(group).getByRole('button', { name: 'Teilung rückgängig' }));
    await waitFor(() => expect(values(group)).toEqual(['Mira sagt: Hallo.']));
    expect(fake.puts[1]).toEqual({ revision: 1, blocks: [{ id: 'b1', text: 'Mira sagt: Hallo.' }] });
    expect(within(group).queryByRole('button', { name: 'Teilung rückgängig' })).not.toBeInTheDocument();
  });

  it('includes an unsaved edit of the active block in the split and hides undo once a half changes', async () => {
    const fake = fakeServer([{ id: 'b1', text: 'Eins' }]);
    const group = await openSection();
    await userEvent.type(blockField(group, 1), ' Zwei');
    placeCaret(blockField(group, 1), 4);
    await userEvent.click(within(group).getByRole('button', { name: 'Hier teilen' }));
    await waitFor(() => expect(values(group)).toEqual(['Eins', ' Zwei']));
    expect(fake.puts).toEqual([{ revision: 0, blocks: [{ id: 'b1', text: 'Eins' }, { text: ' Zwei' }] }]);
    expect(within(group).getByRole('button', { name: 'Teilung rückgängig' })).toBeInTheDocument();
    await userEvent.type(blockField(group, 2), '!');
    expect(within(group).queryByRole('button', { name: 'Teilung rückgängig' })).not.toBeInTheDocument();
  });

  it('inserts an empty block after the active one, focuses it, and removes it again while empty', async () => {
    const fake = fakeServer([{ id: 'b1', text: 'A' }, { id: 'b2', text: 'B' }]);
    const group = await openSection();
    expect(within(group).queryByRole('button', { name: 'Leeren Block entfernen' })).not.toBeInTheDocument();
    placeCaret(blockField(group, 1), 1);
    await userEvent.click(within(group).getByRole('button', { name: 'Block einfügen' }));
    await waitFor(() => expect(values(group)).toEqual(['A', '', 'B']));
    expect(fake.puts).toEqual([{ revision: 0, blocks: [{ id: 'b1', text: 'A' }, { text: '' }, { id: 'b2', text: 'B' }] }]);
    await waitFor(() => expect(blockField(group, 2)).toHaveFocus());
    await userEvent.click(within(group).getByRole('button', { name: 'Leeren Block entfernen' }));
    await waitFor(() => expect(values(group)).toEqual(['A', 'B']));
    expect(fake.puts[1]).toEqual({ revision: 1, blocks: [{ id: 'b1', text: 'A' }, { id: 'b2', text: 'B' }] });
  });

  it('appends a block at the end when no block is active', async () => {
    const fake = fakeServer([{ id: 'b1', text: 'A' }, { id: 'b2', text: 'B' }]);
    const group = await openSection();
    await userEvent.click(within(group).getByRole('button', { name: 'Block einfügen' }));
    await waitFor(() => expect(values(group)).toEqual(['A', 'B', '']));
    expect(fake.puts[0]!.blocks).toEqual([{ id: 'b1', text: 'A' }, { id: 'b2', text: 'B' }, { text: '' }]);
  });

  it('saves a changed block on blur with the full list, other blocks unchanged; an unchanged blur saves nothing', async () => {
    const fake = fakeServer([{ id: 'b1', text: 'Eins' }, { id: 'b2', text: 'Zwei' }]);
    const group = await openSection();
    await userEvent.click(blockField(group, 2));
    await userEvent.tab();
    expect(fake.puts).toEqual([]);
    await userEvent.type(blockField(group, 1), ' plus');
    await userEvent.tab();
    await waitFor(() => expect(fake.puts).toHaveLength(1));
    expect(fake.puts[0]).toEqual({ revision: 0, blocks: [{ id: 'b1', text: 'Eins plus' }, { id: 'b2', text: 'Zwei' }] });
    expect(values(group)).toEqual(['Eins plus', 'Zwei']);
  });

  it('the wand on block 2 replaces only its selection, and the blur save leaves blocks 1 and 3 identical', async () => {
    const fake = fakeServer([
      { id: 'b1', text: 'Erster  Block.\n' },
      { id: 'b2', text: 'Mira sagt etwas Leises.' },
      { id: 'b3', text: ' Dritter.' },
    ]);
    const ai: unknown[] = [];
    server.use(
      http.post('/api/books/b1/ai/text', async ({ request }) => {
        ai.push(await request.json());
        return HttpResponse.json({ suggestions: ['etwas Lautes'] });
      }),
    );
    const group = await openSection();
    await userEvent.selectOptions(within(group).getByLabelText('Länge'), 'long');
    placeCaret(blockField(group, 2), 10, 22);
    await userEvent.click(within(group).getByRole('button', { name: 'KI-Assistent: Block 2 Szene Bergsee' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Umformulieren' }));
    await within(group).findByText('1/1');
    expect(ai).toEqual([
      {
        target: { kind: 'sceneBlock', assignmentId: 'a1', blockId: 'b2', field: 'text' },
        action: 'rephrase',
        text: 'Mira sagt etwas Leises.',
        selection: { start: 10, end: 22 },
        draft: {},
        length: 'long',
      },
    ]);
    expect(values(group)).toEqual(['Erster  Block.\n', 'Mira sagt etwas Lautes.', ' Dritter.']);
    act(() => blockField(group, 2).blur());
    await waitFor(() => expect(fake.puts).toHaveLength(1));
    expect(fake.puts[0]).toEqual({
      revision: 0,
      blocks: [
        { id: 'b1', text: 'Erster  Block.\n' },
        { id: 'b2', text: 'Mira sagt etwas Lautes.' },
        { id: 'b3', text: ' Dritter.' },
      ],
    });
  });

  it('generates into a newly inserted empty block only', async () => {
    fakeServer([{ id: 'b1', text: 'Frage?' }, { id: 'b2', text: 'Danach.' }]);
    const ai: unknown[] = [];
    server.use(
      http.post('/api/books/b1/ai/text', async ({ request }) => {
        ai.push(await request.json());
        return HttpResponse.json({ suggestions: ['Antwort.'] });
      }),
    );
    const group = await openSection();
    placeCaret(blockField(group, 1), 6);
    await userEvent.click(within(group).getByRole('button', { name: 'Block einfügen' }));
    await waitFor(() => expect(blockField(group, 2)).toHaveFocus());
    await userEvent.click(within(group).getByRole('button', { name: 'KI-Assistent: Block 2 Szene Bergsee' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Vorschlagen' }));
    await within(group).findByText('1/1');
    expect(ai).toEqual([
      { target: { kind: 'sceneBlock', assignmentId: 'a1', blockId: 'new1', field: 'text' }, action: 'generate', text: '', selection: null, draft: {}, length: 'book' },
    ]);
    expect(values(group)).toEqual(['Frage?', 'Antwort.', 'Danach.']);
  });

  it('on a stale save shows the message and the stored state', async () => {
    const fake = fakeServer([{ id: 'b1', text: 'Alt' }]);
    const group = await openSection();
    fake.otherTab([{ id: 'b1', text: 'Aus dem anderen Tab' }]);
    await userEvent.type(blockField(group, 1), ' hier');
    await userEvent.tab();
    expect(await within(group).findByRole('alert')).toHaveTextContent('Die Szene wurde inzwischen geändert. Der aktuelle Stand ist geladen.');
    await waitFor(() => expect(values(group)).toEqual(['Aus dem anderen Tab']));
    expect(fake.puts).toEqual([{ revision: 0, blocks: [{ id: 'b1', text: 'Alt hier' }] }]);
  });

  it('a refetch while a block has unsaved text does not move the base: the save is stale, not a silent overwrite', async () => {
    const fake = fakeServer([{ id: 'b1', text: 'Alt' }]);
    const group = await openSection();
    await userEvent.type(blockField(group, 1), ' hier');
    // Another tab saved; a background refetch brings that state into the cache while the edit is unsaved.
    fake.otherTab([{ id: 'b1', text: 'Aus dem anderen Tab' }]);
    act(() => queryClient.setQueryData(['book', 'b1'], fake.response()));
    expect(values(group)).toEqual(['Alt hier']);
    await userEvent.tab();
    expect(await within(group).findByRole('alert')).toHaveTextContent('Die Szene wurde inzwischen geändert. Der aktuelle Stand ist geladen.');
    expect(fake.puts).toEqual([{ revision: 0, blocks: [{ id: 'b1', text: 'Alt hier' }] }]);
    await waitFor(() => expect(values(group)).toEqual(['Aus dem anderen Tab']));
  });

  it('after an own save the next edit starts from the saved revision (no spurious stale)', async () => {
    const fake = fakeServer([{ id: 'b1', text: 'Eins' }, { id: 'b2', text: 'Zwei' }]);
    const group = await openSection();
    await userEvent.type(blockField(group, 1), '!');
    await userEvent.tab();
    await waitFor(() => expect(fake.puts).toHaveLength(1));
    await userEvent.type(blockField(group, 2), '?');
    await userEvent.click(within(group).getByRole('button', { name: 'Block einfügen' }));
    await waitFor(() => expect(fake.puts).toHaveLength(2));
    expect(fake.puts[0]!.revision).toBe(0);
    expect(fake.puts[1]).toEqual({ revision: 1, blocks: [{ id: 'b1', text: 'Eins!' }, { id: 'b2', text: 'Zwei?' }, { text: '' }] });
    await waitFor(() => expect(values(group)).toEqual(['Eins!', 'Zwei?', '']));
    expect(within(group).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('after a stale save, operations still queued are dropped', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const fake = fakeServer([{ id: 'b1', text: 'Alt' }], { beforePut: () => gate });
    const group = await openSection();
    fake.otherTab([{ id: 'b1', text: 'Aus dem anderen Tab' }]);
    await userEvent.type(blockField(group, 1), ' hier');
    await userEvent.tab();
    await waitFor(() => expect(fake.puts).toHaveLength(1));
    await userEvent.click(within(group).getByRole('button', { name: 'Block einfügen' }));
    release();
    expect(await within(group).findByRole('alert')).toHaveTextContent('Die Szene wurde inzwischen geändert.');
    await waitFor(() => expect(values(group)).toEqual(['Aus dem anderen Tab']));
    await new Promise((r) => setTimeout(r, 50));
    expect(fake.puts).toHaveLength(1);
    expect(values(group)).toEqual(['Aus dem anderen Tab']);
  });

  it('renders blocks for an assignment to a whole storyline (side strand)', async () => {
    const fake = fakeServer([{ id: 'b1', text: 'Erinnerung' }, { id: 'b2', text: 'am See' }], { side: true });
    renderApp('/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Storyline „Erinnerung“' }));
    await userEvent.click(await screen.findByRole('tab', { name: 'Szenen' }));
    const group = screen.getByRole('group', { name: 'Szenen' });
    expect(values(group)).toEqual(['Erinnerung', 'am See']);
    placeCaret(blockField(group, 2), 2);
    await userEvent.click(within(group).getByRole('button', { name: 'Hier teilen' }));
    await waitFor(() => expect(values(group)).toEqual(['Erinnerung', 'am', ' See']));
    expect(fake.puts[0]!.blocks).toEqual([{ id: 'b1', text: 'Erinnerung' }, { id: 'b2', text: 'am' }, { text: ' See' }]);
  });
});
