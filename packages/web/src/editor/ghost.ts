/**
 * Typing assistant ("Schreibhilfe beim Tippen"): after a short pause at the end of the text, the wand is asked
 * quietly for a continuation, shown in grey after the caret. Tab takes it, Ctrl/Cmd+→ takes one word,
 * Esc or simply typing on dismisses it. Off by default, since every pause costs an AI request.
 */
import { Prec, StateEffect, StateField } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import { suggestionField } from './suggestion';
import type { Assist } from './selectionTools';

/** Pause after typing before a continuation is requested (ms). */
export const GHOST_DELAY = 1100;
/** Minimum text length before the assistant starts guessing. */
export const GHOST_MIN_TEXT = 20;

/** A continuation shown at `pos`. */
export interface Ghost {
  pos: number;
  text: string;
}

export const setGhost = StateEffect.define<Ghost | null>();

/** The shown continuation; any edit or caret move removes it. */
export const ghostField = StateField.define<Ghost | null>({
  create: () => null,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setGhost)) return e.value;
    return tr.docChanged || tr.selection ? null : v;
  },
  provide: (f) =>
    EditorView.decorations.from(f, (g) =>
      g ? Decoration.set([Decoration.widget({ widget: new GhostWidget(g.text), side: 1 }).range(g.pos)]) : Decoration.none,
    ),
});

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: GhostWidget): boolean {
    return other.text === this.text;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-ghost';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = this.text;
    return span;
  }
}

/** Inserts the first `count` characters of the continuation; the rest stays visible. */
function take(view: EditorView, count: number): boolean {
  const g = view.state.field(ghostField, false);
  if (!g) return false;
  const insert = g.text.slice(0, count);
  const rest = g.text.slice(count);
  const end = g.pos + insert.length;
  view.dispatch({
    changes: { from: g.pos, insert },
    selection: { anchor: end },
    effects: setGhost.of(rest ? { pos: end, text: rest } : null),
    userEvent: 'input.ai',
    scrollIntoView: true,
  });
  return true;
}

/** Takes the whole continuation. */
export const acceptGhost = (view: EditorView) => take(view, view.state.field(ghostField, false)?.text.length ?? 0);
/** Takes the next word (with the space before it). */
export const acceptGhostWord = (view: EditorView) => take(view, /^\s*\S+/u.exec(view.state.field(ghostField, false)?.text ?? '')?.[0].length ?? 0);
const dismissGhost = (view: EditorView) => {
  if (!view.state.field(ghostField, false)) return false;
  view.dispatch({ effects: setGhost.of(null) });
  return true;
};

/** True when a continuation makes sense now: caret at the end of a long enough text, no suggestion open. */
function ready(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  return view.hasFocus && !state.readOnly && sel.empty && sel.head === state.doc.length && state.doc.length >= GHOST_MIN_TEXT && !state.field(suggestionField, false);
}

/** The typing assistant; `getAssist` returns the wand that answers the quiet requests. */
export function ghost(getAssist: () => Assist | null): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | null = null;
      constructor(readonly view: EditorView) {}
      update(u: ViewUpdate) {
        if (!u.docChanged && !u.selectionSet) return;
        this.clear();
        if (u.transactions.some((tr) => tr.isUserEvent('input.type'))) this.timer = setTimeout(() => void this.ask(), GHOST_DELAY);
      }
      async ask() {
        this.timer = null;
        const assist = getAssist();
        if (!assist?.complete || !ready(this.view)) return;
        const doc = this.view.state.doc;
        const text = await assist.complete();
        if (!text || this.view.state.doc !== doc || !ready(this.view)) return;
        this.view.dispatch({ effects: setGhost.of({ pos: doc.length, text }) });
      }
      clear() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
      }
      destroy() {
        this.clear();
      }
    },
  );
  return [
    ghostField,
    plugin,
    Prec.highest(
      keymap.of([
        { key: 'Tab', run: acceptGhost },
        { key: 'Mod-ArrowRight', run: acceptGhostWord },
        { key: 'Escape', run: dismissGhost },
      ]),
    ),
  ];
}
