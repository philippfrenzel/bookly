/**
 * CodeMirror extension for "@" mentions: typing "@" offers the book's characters, choosing one inserts the plain
 * name. Known names are tinted in the text. The server adds the profiles of named characters to AI requests,
 * so a mention is all it takes to give the AI that context.
 */
import { autocompletion } from '@codemirror/autocomplete';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { Decoration, MatchDecorator, ViewPlugin } from '@codemirror/view';
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex for whole-word occurrences of any of `names` (longest first, so "Lena Maier" wins over "Lena"). */
export function namePattern(names: readonly string[]): RegExp | null {
  if (names.length === 0) return null;
  const alts = [...names].sort((a, b) => b.length - a.length).map(escape).join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, 'gu');
}

/** Completion source: "@" at the start of a word, followed by what was typed so far. */
export function mentionSource(names: readonly string[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/@[\p{L}\p{M}' -]*/u);
    if (!m) return null;
    if (m.from > 0 && /[\p{L}\p{N}]/u.test(ctx.state.sliceDoc(m.from - 1, m.from))) return null;
    return {
      from: m.from,
      options: names.map((name) => ({ label: `@${name}`, apply: name, detail: 'Figur', type: 'mention' })),
      validFor: /^@[\p{L}\p{M}' -]*$/u,
    };
  };
}

/** Tints known names. */
function highlighter(pattern: RegExp): Extension {
  const decorator = new MatchDecorator({ regexp: pattern, decoration: Decoration.mark({ class: 'cm-mention' }) });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view);
      }
      update(u: ViewUpdate) {
        this.decorations = decorator.updateDeco(u, this.decorations);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

/** "@" completion and name highlighting for `names`; nothing when there are none. */
export function mentions(names: readonly string[]): Extension {
  const pattern = namePattern(names);
  if (!pattern) return [];
  return [autocompletion({ override: [mentionSource(names)], icons: false }), highlighter(pattern)];
}
