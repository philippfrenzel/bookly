/** Tests for ProseField with the real CodeMirror editor: value, limits, blur, and AI suggestions as changes. */
import { createRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { EditorView } from '@codemirror/view';
import { undo } from '@codemirror/commands';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../test/setup';
import { MagicWand } from '../ai/MagicWand';
import { ProseField } from './ProseField';
import type { ProseHandle } from './ProseField';

vi.unmock('./ProseField');

/** The CodeMirror view behind the field labelled `label`. */
const viewOf = (label: string) => EditorView.findFromDOM(screen.getByLabelText(label))!;

/** Replaces the selection (or inserts at the caret) as if the author typed `text`. */
const typeText = (view: EditorView, text: string) =>
  act(() => view.dispatch(view.state.replaceSelection(text), { userEvent: 'input.type' }));

describe('ProseField', () => {
  it('shows its value, reports edits and follows a new controlled value', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ProseField ariaLabel="Text" value="Mira geht." onChange={onChange} />);
    const view = viewOf('Text');
    expect(view.state.doc.toString()).toBe('Mira geht.');
    act(() => view.dispatch({ selection: { anchor: 10 } }));
    typeText(view, ' Weit.');
    expect(onChange).toHaveBeenLastCalledWith('Mira geht. Weit.');
    rerender(<ProseField ariaLabel="Text" value="Neu" onChange={onChange} />);
    expect(view.state.doc.toString()).toBe('Neu');
  });

  it('refuses edits beyond maxLength but allows shortening', () => {
    render(<ProseField ariaLabel="Text" defaultValue="abcd" maxLength={5} />);
    const view = viewOf('Text');
    act(() => view.dispatch({ selection: { anchor: 4 } }));
    typeText(view, 'xyz');
    expect(view.state.doc.toString()).toBe('abcd');
    typeText(view, 'e');
    expect(view.state.doc.toString()).toBe('abcde');
    act(() => view.dispatch({ changes: { from: 0, to: 2 } }));
    expect(view.state.doc.toString()).toBe('cde');
  });

  it('calls onBlur with the text when focus leaves the field', async () => {
    const onBlur = vi.fn();
    render(
      <>
        <ProseField ariaLabel="Text" defaultValue="Hallo" onBlur={onBlur} />
        <button type="button">weiter</button>
      </>,
    );
    act(() => viewOf('Text').focus());
    await userEvent.click(screen.getByRole('button', { name: 'weiter' }));
    expect(onBlur).toHaveBeenCalledWith('Hallo');
  });

  it('follows a changed accessible name', () => {
    const { rerender } = render(<ProseField ariaLabel="Block 2" defaultValue="x" />);
    rerender(<ProseField ariaLabel="Block 3" defaultValue="x" />);
    expect(screen.getByLabelText('Block 3')).toBeInTheDocument();
    expect(screen.queryByLabelText('Block 2')).toBeNull();
  });

  it('is read-only while readOnly is set', () => {
    render(<ProseField ariaLabel="Text" defaultValue="fest" readOnly />);
    expect(screen.getByLabelText('Text')).toHaveAttribute('contenteditable', 'false');
  });

  it('shows a suggestion as a change, writes it only on accept, and undoes it in one step', () => {
    const ref = createRef<ProseHandle>();
    const onChange = vi.fn();
    render(<ProseField ref={ref} ariaLabel="Text" defaultValue="Das Meer war schwarz." onChange={onChange} />);
    const seen: unknown[] = [];
    ref.current!.subscribe((s) => seen.push(s?.index ?? null));
    act(() => ref.current!.suggest(4, 8, ['Wasser', 'Dunkel']));
    expect(ref.current!.value).toBe('Das Meer war schwarz.');
    expect(document.querySelector('del.cm-ai-del')).toHaveTextContent('Meer');
    expect(document.querySelector('ins.cm-ai-ins')).toHaveTextContent('Wasser');
    act(() => ref.current!.cycle(1));
    expect(document.querySelector('ins.cm-ai-ins')).toHaveTextContent('Dunkel');
    act(() => ref.current!.accept());
    expect(ref.current!.value).toBe('Das Dunkel war schwarz.');
    expect(onChange).toHaveBeenLastCalledWith('Das Dunkel war schwarz.');
    expect(document.querySelector('.cm-ai-ins')).toBeNull();
    expect(seen).toEqual([0, 1, null]);
    act(() => void undo(viewOf('Text')));
    expect(ref.current!.value).toBe('Das Meer war schwarz.');
  });

  it('discards a suggestion on reject and on any edit', () => {
    const ref = createRef<ProseHandle>();
    render(<ProseField ref={ref} ariaLabel="Text" defaultValue="Eins zwei." />);
    act(() => ref.current!.suggest(0, 4, ['Drei']));
    act(() => ref.current!.reject());
    expect(ref.current!.suggestion()).toBeNull();
    expect(ref.current!.value).toBe('Eins zwei.');
    act(() => ref.current!.suggest(0, 4, ['Drei']));
    typeText(viewOf('Text'), 'x');
    expect(ref.current!.suggestion()).toBeNull();
  });
});

describe('MagicWand on a ProseField', () => {
  function Harness() {
    const ref = createRef<ProseHandle>();
    return (
      <div className="wand-field">
        <ProseField ref={ref} ariaLabel="Feld" defaultValue="Mira geht." />
        <MagicWand
          getField={() => ref.current}
          bookId="b1"
          target={{ kind: 'storyline', storylineId: null, field: 'description' }}
          draft={() => ({ title: 'Titel' })}
          enabled
          fieldLabel="Beschreibung"
        />
      </div>
    );
  }

  it('shows the reply as a change, switches, and writes the chosen suggestion on „Übernehmen“', async () => {
    server.use(http.post('/api/books/b1/ai/text', () => HttpResponse.json({ suggestions: ['A1', 'A2', 'A3'] })));
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'KI-Assistent: Beschreibung' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Umformulieren' }));
    await screen.findByText('1/3');
    const view = viewOf('Feld');
    expect(view.state.doc.toString()).toBe('Mira geht.');
    expect(document.querySelector('ins.cm-ai-ins')).toHaveTextContent('A1');
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Vorschlag' }));
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(document.querySelector('ins.cm-ai-ins')).toHaveTextContent('A2');
    await userEvent.click(screen.getByRole('button', { name: 'Vorschlag übernehmen' }));
    expect(view.state.doc.toString()).toBe('A2');
    expect(screen.queryByText('2/3')).not.toBeInTheDocument();
  });

  it('closes the bar and keeps the text when the suggestion is discarded', async () => {
    server.use(http.post('/api/books/b1/ai/text', () => HttpResponse.json({ suggestions: ['A1', 'A2'] })));
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'KI-Assistent: Beschreibung' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Umformulieren' }));
    await screen.findByText('1/2');
    await userEvent.click(screen.getByRole('button', { name: 'Vorschlag verwerfen' }));
    expect(viewOf('Feld').state.doc.toString()).toBe('Mira geht.');
    expect(screen.queryByText('1/2')).not.toBeInTheDocument();
    expect(document.querySelector('.cm-ai-ins')).toBeNull();
  });
});
