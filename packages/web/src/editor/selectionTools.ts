/**
 * CodeMirror extension: a small toolbar over selected text with the wand's actions (Umformulieren,
 * Stil verbessern, Anweisung …). "Anweisung …" and Ctrl+K turn it into a field for a free instruction.
 * It only appears while a magic wand has registered itself on the field (see ProseHandle.setAssist).
 */
import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension } from '@codemirror/state';
import { EditorView, keymap, showTooltip } from '@codemirror/view';
import type { Tooltip } from '@codemirror/view';
import { MAX_INSTRUCTION, MIN_SELECTION } from '@bookly/shared';
import { suggestionField } from './suggestion';

/** Ready-made instructions offered as one-click chips (toolbar and wand menu). */
export const INSTRUCTION_EXAMPLES = ['spannender', 'kürzer', 'mehr Dialog'];

/** What the toolbar can ask the wand to do with the current selection. */
export type AssistAction = 'rephrase' | 'polish' | 'instruct';

/** The wand behind a field; `run` acts on the field's current selection. */
export interface Assist {
  run(action: AssistAction, instruction?: string): void;
}

/** Turns the toolbar on (a wand is registered and enabled) or off. */
export const setAssistOn = StateEffect.define<boolean>();
const assistOn = StateField.define<boolean>({
  create: () => false,
  update: (v, tr) => tr.effects.reduce((acc, e) => (e.is(setAssistOn) ? e.value : acc), v),
});

/** Whether the toolbar is currently switched on in `state`. */
export function assistIsOn(state: EditorState): boolean {
  return state.field(assistOn, false) ?? false;
}

/** Switches the toolbar between its buttons and the instruction field. */
export const setInstructing = StateEffect.define<boolean>();
const instructing = StateField.define<boolean>({
  create: () => false,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setInstructing)) return e.value;
    return tr.docChanged || (tr.selection && tr.state.selection.main.empty) ? false : v;
  },
});

/** True when the selection is long enough for the wand's actions. */
function selectionUsable(state: EditorState): boolean {
  const { from, to } = state.selection.main;
  return state.sliceDoc(from, to).trim().length >= MIN_SELECTION;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  // Keep the editor's focus and selection when a button is pressed with the mouse.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', onClick);
  return b;
}

/** Toolbar DOM: three buttons. */
function toolsDom(view: EditorView, getAssist: () => Assist | null): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'sel-tools';
  dom.setAttribute('role', 'toolbar');
  dom.setAttribute('aria-label', 'KI für die Markierung');
  dom.append(
    button('Umformulieren', '', () => getAssist()?.run('rephrase')),
    button('Stil verbessern', '', () => getAssist()?.run('polish')),
    button('Anweisung …', 'is-accent', () => view.dispatch({ effects: setInstructing.of(true) })),
  );
  return dom;
}

/** Instruction DOM: input, "Los", example chips. Enter sends, Escape returns to the text. */
function instructionDom(view: EditorView, getAssist: () => Assist | null): { dom: HTMLElement; input: HTMLInputElement } {
  const dom = document.createElement('form');
  dom.className = 'sel-tools instruction-form';
  const row = document.createElement('div');
  row.className = 'instruction-row';
  const input = document.createElement('input');
  input.setAttribute('aria-label', 'Anweisung an die KI');
  input.placeholder = 'Was soll die KI tun?';
  input.maxLength = MAX_INSTRUCTION;
  const go = document.createElement('button');
  go.type = 'submit';
  go.className = 'primary';
  go.textContent = 'Los';
  row.append(input, go);
  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    view.dispatch({ effects: setInstructing.of(false) });
    getAssist()?.run('instruct', trimmed);
  };
  const chips = document.createElement('div');
  chips.className = 'instruction-chips';
  for (const ex of INSTRUCTION_EXAMPLES) chips.append(button(ex, 'chip', () => send(ex)));
  dom.append(row, chips);
  dom.addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    view.dispatch({ effects: setInstructing.of(false) });
    view.focus();
  });
  return { dom, input };
}

/** Selects the paragraph (line) at the caret when nothing is selected, then opens the instruction field. */
function openInstruction(view: EditorView): boolean {
  if (!view.state.field(assistOn)) return false;
  const sel = view.state.selection.main;
  if (sel.empty) {
    const line = view.state.doc.lineAt(sel.head);
    if (line.text.trim().length < MIN_SELECTION) return false;
    view.dispatch({ selection: { anchor: line.from, head: line.to } });
  }
  view.dispatch({ effects: setInstructing.of(true) });
  return true;
}

/** The toolbar extension; `getAssist` returns the wand registered on the field, if any. */
export function selectionTools(getAssist: () => Assist | null): Extension {
  const tooltipField = StateField.define<Tooltip | null>({
    create: () => null,
    update(prev, tr) {
      const st = tr.state;
      const show = st.field(assistOn) && !st.readOnly && !st.field(suggestionField, false) && selectionUsable(st);
      if (!show) return null;
      const pos = st.selection.main.from;
      const asking = st.field(instructing);
      const prevAsking = tr.startState.field(instructing);
      if (prev && prev.pos === pos && asking === prevAsking) return prev;
      return {
        pos,
        above: true,
        arrow: false,
        create: (view) => {
          if (!asking) return { dom: toolsDom(view, getAssist) };
          const { dom, input } = instructionDom(view, getAssist);
          return { dom, mount: () => input.focus() };
        },
      };
    },
    provide: (f) => showTooltip.from(f),
  });
  return [assistOn, instructing, tooltipField, keymap.of([{ key: 'Mod-k', run: openInstruction }])];
}
