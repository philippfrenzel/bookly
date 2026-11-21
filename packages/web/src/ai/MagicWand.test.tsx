/** Tests for the MagicWand component: menu, request body, suggestion bar and its keys. */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { AiTextDraft, AiTextTarget } from '@bookly/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../test/setup';
import { MagicWand } from './MagicWand';

const target: AiTextTarget = { kind: 'storyline', storylineId: null, field: 'description' };
let bodies: unknown[] = [];

beforeEach(() => {
  bodies = [];
  server.use(
    http.post('/api/books/b1/ai/text', async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ suggestions: ['A1', 'A2', 'A3'] });
    }),
  );
});
afterEach(() => vi.restoreAllMocks());

/** Uncontrolled textarea with a wand, as the callers will place it. */
function Harness({ value, draft = () => ({ title: 'Titel' }), enabled = true }: { value: string; draft?: () => AiTextDraft; enabled?: boolean }) {
  return (
    <div className="wand-field">
      <textarea aria-label="Feld" defaultValue={value} />
      <MagicWand
        getField={() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Feld"]')}
        bookId="b1"
        target={target}
        draft={draft}
        enabled={enabled}
        fieldLabel="Beschreibung"
      />
    </div>
  );
}

const field = () => screen.getByLabelText('Feld') as HTMLTextAreaElement;
const wand = () => screen.getByRole('button', { name: 'KI-Assistent: Beschreibung' });

/** Opens the wand menu and chooses `label`, then waits for the bar. */
async function choose(label: string) {
  await userEvent.click(wand());
  await userEvent.click(screen.getByRole('menuitem', { name: label }));
  await screen.findByText('1/3');
}

/** A handler whose reply waits until `release` is called. */
function delayedHandler() {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  server.use(
    http.post('/api/books/b1/ai/text', async ({ request }) => {
      bodies.push(await request.json());
      await gate;
      return HttpResponse.json({ suggestions: ['A1', 'A2', 'A3'] });
    }),
  );
  return () => release();
}

describe('MagicWand', () => {
  it('rephrases the whole text without a selection', async () => {
    render(<Harness value="Mira geht." />);
    await choose('Umformulieren');
    expect(field().value).toBe('A1');
    expect(bodies).toEqual([{ target, action: 'rephrase', text: 'Mira geht.', selection: null, draft: { title: 'Titel' } }]);
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('keeps the selection when the wand is clicked', async () => {
    render(<Harness value="Mira geht weg" />);
    field().focus();
    field().setSelectionRange(5, 9);
    await choose('Umformulieren');
    expect(bodies[0]).toMatchObject({ selection: { start: 5, end: 9 } });
    expect(field().value).toBe('Mira A1 weg');
  });

  it('switches suggestions', async () => {
    render(<Harness value="Mira geht weg" />);
    field().focus();
    field().setSelectionRange(5, 9);
    await choose('Umformulieren');
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Vorschlag' }));
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Vorschlag' }));
    expect(field().value).toBe('Mira A3 weg');
    expect(screen.getByText('3/3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Vorheriger Vorschlag' }));
    expect(field().value).toBe('Mira A2 weg');
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('switches with Alt+arrow keys and wraps around', async () => {
    render(<Harness value="Mira geht." />);
    await choose('Umformulieren');
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(field().value).toBe('A3');
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(field().value).toBe('A1');
  });

  it('undo restores the original', async () => {
    render(<Harness value="Mira geht." />);
    await choose('Umformulieren');
    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(field().value).toBe('Mira geht.');
    expect(screen.queryByText('1/3')).not.toBeInTheDocument();
  });

  it('close restores the original', async () => {
    render(<Harness value="Mira geht." />);
    await choose('Umformulieren');
    await userEvent.click(screen.getByRole('button', { name: 'Vorschläge schließen' }));
    expect(field().value).toBe('Mira geht.');
    expect(screen.queryByText('1/3')).not.toBeInTheDocument();
  });

  it('Escape restores the original', async () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={(e) => e.key === 'Escape' && outer()}>
        <Harness value="Mira geht." />
      </div>,
    );
    await choose('Umformulieren');
    expect(document.activeElement).toBe(field());
    await userEvent.keyboard('{Escape}');
    expect(field().value).toBe('Mira geht.');
    expect(screen.queryByText('1/3')).not.toBeInTheDocument();
    expect(outer).not.toHaveBeenCalled();
  });

  it('Escape with only the menu open closes the menu and leaves the field', async () => {
    render(<Harness value="Mira geht." />);
    await userEvent.click(wand());
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(field().value).toBe('Mira geht.');
    expect(bodies).toEqual([]);
  });

  it('works with the arrow keys and Enter in the menu', async () => {
    render(<Harness value="Mira geht." />);
    await userEvent.click(wand());
    expect(screen.getByRole('menuitem', { name: 'Umformulieren' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Fortsetzen' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Stil verbessern' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await screen.findByText('1/3');
    expect(bodies[0]).toMatchObject({ action: 'polish' });
  });

  it('typing keeps the suggestion and closes the bar', async () => {
    render(<Harness value="Mira geht." />);
    await choose('Umformulieren');
    field().setSelectionRange(2, 2);
    await userEvent.keyboard('!');
    expect(field().value).toBe('A1!');
    expect(screen.queryByText('1/3')).not.toBeInTheDocument();
  });

  it('a click outside keeps the suggestion and closes the bar', async () => {
    render(
      <>
        <Harness value="Mira geht." />
        <button type="button">Draußen</button>
      </>,
    );
    await choose('Umformulieren');
    await userEvent.click(screen.getByRole('button', { name: 'Draußen' }));
    expect(field().value).toBe('A1');
    expect(screen.queryByText('1/3')).not.toBeInTheDocument();
  });

  it('continue appends with a space', async () => {
    render(<Harness value="Mira geht" />);
    await choose('Fortsetzen');
    expect(field().value).toBe('Mira geht A1');
    expect(bodies[0]).toMatchObject({ action: 'continue', selection: null });
  });

  it('empty field offers only Vorschlagen', async () => {
    render(<Harness value="" />);
    await userEvent.click(wand());
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Vorschlagen']);
    expect(items[0]).toBeEnabled();
    await userEvent.click(items[0]!);
    await screen.findByText('1/3');
    expect(bodies[0]).toMatchObject({ action: 'generate', text: '', selection: null });
    expect(field().value).toBe('A1');
  });

  it('disabled when draft has no text', async () => {
    render(<Harness value="" draft={() => ({})} />);
    await userEvent.click(wand());
    expect(screen.getByRole('menuitem', { name: 'Vorschlagen' })).toBeDisabled();
    expect(screen.getByText('Erst Titel oder Beschreibung eingeben.')).toBeInTheDocument();
  });

  it('drops a reply when the text changed meanwhile', async () => {
    const release = delayedHandler();
    render(<Harness value="Mira geht." />);
    await userEvent.click(wand());
    await userEvent.click(screen.getByRole('menuitem', { name: 'Umformulieren' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(wand()).toBeDisabled();
    field().focus();
    field().setSelectionRange(10, 10);
    await userEvent.keyboard('X');
    release();
    await waitFor(() => expect(wand()).toBeEnabled());
    expect(field().value).toBe('Mira geht.X');
    expect(screen.queryByText('1/3')).not.toBeInTheDocument();
  });

  it('ignores a reply after unmount', async () => {
    const error = vi.spyOn(console, 'error');
    const release = delayedHandler();
    const { unmount } = render(<Harness value="Mira geht." />);
    await userEvent.click(wand());
    await userEvent.click(screen.getByRole('menuitem', { name: 'Umformulieren' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    unmount();
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(error).not.toHaveBeenCalled();
  });

  it('shows Vorschlag fehlgeschlagen. on 502', async () => {
    server.use(http.post('/api/books/b1/ai/text', () => HttpResponse.json({ error: 'ai_failed' }, { status: 502 })));
    render(<Harness value="Mira geht." />);
    await userEvent.click(wand());
    await userEvent.click(screen.getByRole('menuitem', { name: 'Umformulieren' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Vorschlag fehlgeschlagen.');
    expect(field().value).toBe('Mira geht.');
    expect(screen.queryByText('1/3')).not.toBeInTheDocument();
  });

  it('shows Kein Vorschlag. when nothing fits', async () => {
    server.use(http.post('/api/books/b1/ai/text', () => HttpResponse.json({ suggestions: ['  ', ''] })));
    render(<Harness value="Mira geht." />);
    await userEvent.click(wand());
    await userEvent.click(screen.getByRole('menuitem', { name: 'Umformulieren' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Kein Vorschlag.'));
    expect(field().value).toBe('Mira geht.');
  });

  it('disabled with title KI nicht eingerichtet when enabled is false', () => {
    render(<Harness value="Mira geht." enabled={false} />);
    expect(wand()).toBeDisabled();
    expect(wand()).toHaveAttribute('title', 'KI nicht eingerichtet');
  });
});
