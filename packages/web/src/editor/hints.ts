/**
 * Reviewer hints ("Lektor-Hinweise"): wavy underlines for filler words and for nouns repeated shortly after
 * each other. Found locally, without an AI request. Hovering shows why; with a wand on the field the hint
 * offers to have the sentence rephrased.
 */
import { StateField } from '@codemirror/state';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, EditorView, hoverTooltip } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { Assist } from './selectionTools';

/** One hint: the range to underline and the reason shown on hover. */
export interface TextHint {
  from: number;
  to: number;
  kind: 'filler' | 'repeat';
  message: string;
}

/** Words that rarely add meaning in prose. */
export const FILLER_WORDS = ['eigentlich', 'plötzlich', 'irgendwie', 'wirklich', 'ziemlich', 'sozusagen', 'quasi', 'gewissermaßen', 'halt'];
/** A repeated noun is flagged when it comes back within this many words. */
export const REPEAT_WINDOW = 25;

const WORD = /[\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*/gu;
const fillers = new Set(FILLER_WORDS);

/** True when the word at `index` starts a sentence (capitalised for grammar, not because it is a noun). */
function startsSentence(text: string, index: number): boolean {
  const before = text.slice(0, index).replace(/[\s„"»«‚'(–-]+$/u, '');
  return before === '' || /[.!?…:\n]$/u.test(before);
}

/** Filler words and nouns repeated within REPEAT_WINDOW words; `names` (characters) are never flagged as repetitions. */
export function findHints(text: string, names: readonly string[] = []): TextHint[] {
  const ignored = new Set(names.flatMap((n) => n.toLowerCase().split(/\s+/)));
  const lastSeen = new Map<string, number>();
  const hints: TextHint[] = [];
  let n = 0;
  for (const m of text.matchAll(WORD)) {
    const word = m[0];
    const from = m.index;
    const to = from + word.length;
    const lower = word.toLowerCase();
    if (fillers.has(lower)) {
      hints.push({ from, to, kind: 'filler', message: `„${word}“ ist oft ein Füllwort. Ohne ist der Satz meist stärker.` });
    } else if (word.length >= 4 && /^\p{Lu}/u.test(word) && !ignored.has(lower) && !startsSentence(text, from)) {
      const prev = lastSeen.get(lower);
      if (prev !== undefined && n - prev <= REPEAT_WINDOW) {
        hints.push({ from, to, kind: 'repeat', message: `„${word}“ kommt kurz davor schon vor. Ein anderes Wort oder ein Pronomen?` });
      }
      lastSeen.set(lower, n);
    }
    n++;
  }
  return hints;
}

/** Start and end of the sentence around `pos` (ends after . ! ? … or at a line break). */
export function sentenceAt(text: string, pos: number): { from: number; to: number } {
  let from = pos;
  while (from > 0 && !/[.!?…\n]/u.test(text[from - 1]!)) from--;
  while (from < pos && /\s/.test(text[from]!)) from++;
  let to = pos;
  while (to < text.length && !/[.!?…\n]/u.test(text[to]!)) to++;
  while (to < text.length && /[.!?…“"»]/u.test(text[to]!)) to++;
  return { from, to };
}

const mark = (kind: TextHint['kind']) => Decoration.mark({ class: `cm-hint cm-hint-${kind}` });

/** The hints for `names`, as underlines with a hover explanation. */
export function hints(names: readonly string[], getAssist: () => Assist | null): Extension {
  const compute = (state: EditorState) => findHints(state.doc.toString(), names);
  const field = StateField.define<{ list: TextHint[]; deco: DecorationSet }>({
    create: (state) => {
      const list = compute(state);
      return { list, deco: Decoration.set(list.map((h) => mark(h.kind).range(h.from, h.to))) };
    },
    update(v, tr) {
      if (!tr.docChanged) return v;
      const list = compute(tr.state);
      return { list, deco: Decoration.set(list.map((h) => mark(h.kind).range(h.from, h.to))) };
    },
    provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
  });
  const hover = hoverTooltip((view, pos) => {
    const hint = view.state.field(field).list.find((h) => pos >= h.from && pos <= h.to);
    if (!hint) return null;
    return {
      pos: hint.from,
      end: hint.to,
      above: true,
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'hint-tip';
        const p = document.createElement('p');
        p.textContent = hint.message;
        dom.append(p);
        const assist = getAssist();
        if (assist && !view.state.readOnly) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = 'Satz umformulieren lassen';
          b.addEventListener('mousedown', (e) => e.preventDefault());
          b.addEventListener('click', () => {
            const s = sentenceAt(view.state.doc.toString(), hint.from);
            view.dispatch({ selection: { anchor: s.from, head: s.to } });
            view.focus();
            getAssist()?.run('rephrase');
          });
          dom.append(b);
        }
        return { dom };
      },
    };
  });
  return [field, hover];
}
