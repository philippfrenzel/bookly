/** Tests for the writing aids on a real ProseField: @mentions, reviewer hints, typing assistant, and their switches. */
import { createRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompletionContext } from '@codemirror/autocomplete';
import type { CompletionResult } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MagicWand } from '../ai/MagicWand';
import { GHOST_DELAY } from './ghost';
import { MentionNamesProvider } from './MentionNames';
import { mentionSource } from './mentions';
import { editorPrefs, resetEditorPrefs, setEditorPref } from './preferences';
import { ProseField } from './ProseField';
import type { ProseHandle } from './ProseField';

vi.unmock('./ProseField');

const viewOf = (label: string) => EditorView.findFromDOM(screen.getByLabelText(label))!;
const typeText = (view: EditorView, text: string) =>
  act(() => view.dispatch(view.state.replaceSelection(text), { userEvent: 'input.type' }));

beforeEach(() => {
  localStorage.clear();
  resetEditorPrefs();
});

describe('@mentions', () => {
  const complete = (doc: string) => {
    const state = EditorState.create({ doc });
    return mentionSource(['Lena', 'Jakob Brandt'])(new CompletionContext(state, doc.length, false)) as CompletionResult | null;
  };

  it('offers the characters after "@" and inserts the plain name', () => {
    const r = complete('Dann kam @Le')!;
    expect(r.from).toBe(9);
    expect(r.options.map((o) => [o.label, o.apply])).toEqual([
      ['@Lena', 'Lena'],
      ['@Jakob Brandt', 'Jakob Brandt'],
    ]);
  });

  it('ignores "@" inside a word', () => {
    expect(complete('mail@Le')).toBeNull();
  });

  it('tints known names in the text', () => {
    render(
      <MentionNamesProvider names={['Lena']}>
        <ProseField ariaLabel="Text" defaultValue="Lena und Lenas Hund." />
      </MentionNamesProvider>,
    );
    expect(Array.from(document.querySelectorAll('.cm-mention')).map((e) => e.textContent)).toEqual(['Lena']);
  });
});

describe('reviewer hints', () => {
  it('underlines filler words while switched on, and not after switching off', () => {
    render(<ProseField ariaLabel="Text" defaultValue="Sie war eigentlich müde." />);
    expect(document.querySelector('.cm-hint-filler')?.textContent).toBe('eigentlich');
    act(() => setEditorPref('hints', false));
    expect(document.querySelector('.cm-hint')).toBeNull();
  });
});

describe('typing assistant', () => {
  afterEach(() => vi.useRealTimers());

  /** A field with the assistant on and a stub wand that answers `reply`. */
  const setup = (reply: string | null) => {
    setEditorPref('ghost', true);
    const ref = createRef<ProseHandle>();
    render(<ProseField ref={ref} ariaLabel="Text" defaultValue="Mira ging zum Hafen hinunter." />);
    const complete = vi.fn(async () => reply);
    act(() => ref.current!.setAssist({ run: vi.fn(), complete }));
    const view = viewOf('Text');
    act(() => {
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    });
    return { view, complete };
  };
  const pause = () => act(async () => void vi.advanceTimersByTime(GHOST_DELAY));
  const ghostText = () => document.querySelector('.cm-ghost')?.textContent ?? null;

  it('shows a continuation after a pause at the end, takes a word with Mod-→ and the rest with Tab', async () => {
    vi.useFakeTimers();
    const { view, complete } = setup(' Dort lag ein Boot.');
    typeText(view, ' Es');
    expect(complete).not.toHaveBeenCalled();
    await pause();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(ghostText()).toBe(' Dort lag ein Boot.');
    expect(view.state.doc.toString()).toBe('Mira ging zum Hafen hinunter. Es');
    act(() => void view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true })));
    expect(view.state.doc.toString()).toBe('Mira ging zum Hafen hinunter. Es Dort');
    expect(ghostText()).toBe(' lag ein Boot.');
    act(() => void view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
    expect(view.state.doc.toString()).toBe('Mira ging zum Hafen hinunter. Es Dort lag ein Boot.');
    expect(ghostText()).toBeNull();
  });

  it('drops the continuation on Escape and when typing goes on', async () => {
    vi.useFakeTimers();
    const { view } = setup(' Weiter.');
    typeText(view, ' A');
    await pause();
    act(() => void view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(ghostText()).toBeNull();
    typeText(view, 'b');
    await pause();
    expect(ghostText()).toBe(' Weiter.');
    typeText(view, 'c');
    expect(ghostText()).toBeNull();
  });

  it('asks nothing when the caret is not at the end or the assistant is off', async () => {
    vi.useFakeTimers();
    const { view, complete } = setup(' X');
    act(() => view.dispatch({ selection: { anchor: 4 } }));
    typeText(view, 'a');
    await pause();
    expect(complete).not.toHaveBeenCalled();
    act(() => {
      setEditorPref('ghost', false);
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    });
    typeText(view, 'b');
    await pause();
    expect(complete).not.toHaveBeenCalled();
  });
});

describe('switches in the wand menu', () => {
  it('offers both aids on a ProseField and remembers the choice', async () => {
    const ref = createRef<ProseHandle>();
    render(
      <div className="wand-field">
        <ProseField ref={ref} ariaLabel="Text" defaultValue="Ein Text." />
        <MagicWand getField={() => ref.current} bookId="b1" target={{ kind: 'storyline', storylineId: null, field: 'description' }} enabled fieldLabel="Text" />
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'KI-Assistent: Text' }));
    const hints = screen.getByRole('menuitemcheckbox', { name: 'Lektor-Hinweise' });
    const ghost = screen.getByRole('menuitemcheckbox', { name: 'Schreibhilfe beim Tippen' });
    expect(hints).toHaveAttribute('aria-checked', 'true');
    expect(ghost).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(ghost);
    expect(ghost).toHaveAttribute('aria-checked', 'true');
    expect(editorPrefs().ghost).toBe(true);
    expect(JSON.parse(localStorage.getItem('bookly.editor')!)).toEqual({ hints: true, ghost: true });
  });
});
