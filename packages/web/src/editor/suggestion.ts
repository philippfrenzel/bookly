/**
 * CodeMirror extension that shows an AI suggestion as a change over the text: deleted words are
 * struck through, new words are shown inline, and nothing is written into the document until the
 * author accepts (Tab). Esc discards, Alt+←/→ switches between suggestions, any edit discards.
 */
import { Prec, StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, keymap } from '@codemirror/view';
import { wordDiff } from './wordDiff';

/** A pending suggestion: the range it replaces and the alternatives the AI offered. */
export interface Suggestion {
  from: number;
  to: number;
  suggestions: string[];
  index: number;
}

/** Sets (or with null clears) the pending suggestion. */
export const setSuggestion = StateEffect.define<Suggestion | null>();

/** Holds the pending suggestion; any document change clears it. */
export const suggestionField = StateField.define<Suggestion | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setSuggestion)) return e.value;
    return tr.docChanged ? null : value;
  },
});

/** Inline text the suggestion adds. */
class InsertWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: InsertWidget): boolean {
    return other.text === this.text;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('ins');
    span.className = 'cm-ai-ins';
    span.textContent = this.text;
    return span;
  }
}

/** Decorations for the pending suggestion: struck deletions, inline insertions, a tint on the range. */
function decorate(state: EditorState) {
  const s = state.field(suggestionField);
  if (!s) return Decoration.none;
  const original = state.sliceDoc(s.from, s.to);
  const ranges = [];
  let pos = s.from;
  for (const op of wordDiff(original, s.suggestions[s.index] ?? '')) {
    if (op.type === 'eq') pos += op.text.length;
    else if (op.type === 'del') {
      ranges.push(Decoration.mark({ class: 'cm-ai-del', tagName: 'del' }).range(pos, pos + op.text.length));
      pos += op.text.length;
    } else ranges.push(Decoration.widget({ widget: new InsertWidget(op.text), side: 1 }).range(pos));
  }
  if (s.to > s.from) ranges.push(Decoration.mark({ class: 'cm-ai-range' }).range(s.from, s.to));
  return Decoration.set(ranges, true);
}

/** Writes the shown suggestion into the document as one undoable step. */
export function acceptSuggestion(view: EditorView): boolean {
  const s = view.state.field(suggestionField, false);
  if (!s) return false;
  const insert = s.suggestions[s.index] ?? '';
  view.dispatch({
    changes: { from: s.from, to: s.to, insert },
    effects: setSuggestion.of(null),
    selection: { anchor: s.from, head: s.from + insert.length },
    userEvent: 'input.ai',
    scrollIntoView: true,
  });
  return true;
}

/** Discards the pending suggestion. */
export function rejectSuggestion(view: EditorView): boolean {
  if (!view.state.field(suggestionField, false)) return false;
  view.dispatch({ effects: setSuggestion.of(null) });
  return true;
}

/** Shows the previous (-1) or next (+1) suggestion. */
export function cycleSuggestion(view: EditorView, delta: number): boolean {
  const s = view.state.field(suggestionField, false);
  if (!s || s.suggestions.length < 2) return false;
  const n = s.suggestions.length;
  view.dispatch({ effects: setSuggestion.of({ ...s, index: (s.index + delta + n) % n }) });
  return true;
}

/** The suggestion field, its decorations and its keys (Tab, Esc, Alt+←/→). */
export function suggestions(): Extension {
  return [
    suggestionField,
    EditorView.decorations.compute([suggestionField], decorate),
    Prec.highest(
      keymap.of([
        { key: 'Tab', run: acceptSuggestion },
        { key: 'Escape', run: rejectSuggestion },
        { key: 'Alt-ArrowLeft', run: (v) => cycleSuggestion(v, -1) },
        { key: 'Alt-ArrowRight', run: (v) => cycleSuggestion(v, 1) },
      ]),
    ),
  ];
}
