/**
 * Multi-line text field built on CodeMirror 6, used everywhere Bookly had a <textarea>.
 * It grows with its content, keeps one undo history, and can show an AI suggestion as a change
 * over the text (see ./suggestion). A ref gives a textarea-like handle (`value`, `selectionStart`,
 * `selectionEnd`, `focus`) so existing code that reads fields, including the magic wand, keeps working.
 */
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExt, tooltips } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { acceptSuggestion, cycleSuggestion, rejectSuggestion, setSuggestion, suggestionField, suggestions } from './suggestion';
import type { Suggestion } from './suggestion';
import { assistIsOn, selectionTools, setAssistOn } from './selectionTools';
import type { Assist } from './selectionTools';

/** Textarea-like handle on a ProseField, plus the suggestion controls the magic wand uses. */
export interface ProseHandle {
  readonly kind: 'prose';
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  /** The field's outer element (wraps the editable area). */
  readonly element: HTMLElement;
  focus(): void;
  /** Shows suggestions for `from`..`to` as a change; nothing is written until accepted. */
  suggest(from: number, to: number, list: string[]): void;
  /** The pending suggestion, if any. */
  suggestion(): Suggestion | null;
  cycle(delta: number): void;
  accept(): void;
  reject(): void;
  /** Calls `fn` whenever the pending suggestion changes (shown, switched, accepted, discarded). */
  subscribe(fn: (s: Suggestion | null) => void): () => void;
  /** Registers the wand behind this field (null: none or disabled); shows the toolbar over selected text. */
  setAssist(assist: Assist | null): void;
}

/** True when a field handle is a ProseField rather than a native input. */
export function isProse(el: unknown): el is ProseHandle {
  return typeof el === 'object' && el !== null && (el as { kind?: unknown }).kind === 'prose';
}

export interface ProseFieldProps {
  /** Controlled value; the field follows it when it changes from outside. */
  value?: string;
  /** Initial value of an uncontrolled field. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Called with the current text when focus leaves the field. */
  onBlur?: (value: string) => void;
  /** Called when the field gets focus and whenever its caret or selection moves. */
  onSelect?: (start: number, end: number) => void;
  ariaLabel?: string;
  placeholder?: string;
  maxLength?: number;
  readOnly?: boolean;
  /** Minimum visible lines. */
  rows?: number;
  className?: string;
  id?: string;
}

/** CodeMirror-based replacement for <textarea>. */
export const ProseField = forwardRef<ProseHandle, ProseFieldProps>(function ProseField(props, ref) {
  const { value, defaultValue, ariaLabel, placeholder, maxLength, readOnly = false, rows = 2, className, id } = props;
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const listeners = useRef(new Set<(s: Suggestion | null) => void>());
  const assist = useRef<Assist | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const readOnlyConf = useRef(new Compartment());
  const labelConf = useRef(new Compartment());
  /** Accessible name and placeholder; both can change (e.g. a renamed character or a renumbered block). */
  const labelling = () => [
    EditorView.contentAttributes.of({ 'aria-label': ariaLabel ?? '', 'aria-multiline': 'true', ...(id ? { id } : {}) }),
    placeholder ? placeholderExt(placeholder) : [],
  ];

  useLayoutEffect(() => {
    const limit = maxLength;
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value ?? defaultValue ?? '',
        extensions: [
          history(),
          suggestions(),
          selectionTools(() => assist.current),
          // Tooltips live in <body>, so panels with overflow: hidden cannot clip the toolbar.
          tooltips({ parent: document.body }),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          labelConf.current.of(labelling()),
          readOnlyConf.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          limit === undefined ? [] : EditorState.changeFilter.of((tr) => tr.newDoc.length <= limit || tr.newDoc.length <= tr.startState.doc.length),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current.onChange?.(u.state.doc.toString());
            const before = u.startState.field(suggestionField, false);
            const after = u.state.field(suggestionField, false);
            if (before !== after) for (const fn of listeners.current) fn(after ?? null);
            if (u.selectionSet || u.docChanged || (u.focusChanged && u.view.hasFocus)) {
              const { from, to } = u.state.selection.main;
              latest.current.onSelect?.(from, to);
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Controlled value: follow outside changes without touching the history of own typing.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === undefined) return;
    const current = view.state.doc.toString();
    if (current !== value) view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: labelConf.current.reconfigure(labelling()) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ariaLabel, placeholder, id]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyConf.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
    });
  }, [readOnly]);

  useImperativeHandle(
    ref,
    (): ProseHandle => ({
      kind: 'prose',
      get value() {
        return viewRef.current?.state.doc.toString() ?? '';
      },
      get selectionStart() {
        return viewRef.current?.state.selection.main.from ?? 0;
      },
      get selectionEnd() {
        return viewRef.current?.state.selection.main.to ?? 0;
      },
      get element() {
        return host.current!;
      },
      focus: () => viewRef.current?.focus(),
      suggest: (from, to, list) => viewRef.current?.dispatch({ effects: setSuggestion.of({ from, to, suggestions: list, index: 0 }), selection: { anchor: to } }),
      suggestion: () => viewRef.current?.state.field(suggestionField, false) ?? null,
      cycle: (delta) => void (viewRef.current && cycleSuggestion(viewRef.current, delta)),
      accept: () => {
        const view = viewRef.current;
        if (!view) return;
        acceptSuggestion(view);
        view.focus();
      },
      reject: () => void (viewRef.current && rejectSuggestion(viewRef.current)),
      subscribe: (fn) => {
        listeners.current.add(fn);
        return () => listeners.current.delete(fn);
      },
      setAssist: (next) => {
        assist.current = next;
        // Compare with the editor's own state: the view can be recreated (e.g. React StrictMode) while the wand stays.
        const view = viewRef.current;
        if (view && assistIsOn(view.state) !== (next !== null)) view.dispatch({ effects: setAssistOn.of(next !== null) });
      },
    }),
    [],
  );

  return (
    <div
      ref={host}
      className={className ? `prose-field ${className}` : 'prose-field'}
      style={{ ['--prose-rows' as string]: rows }}
      data-readonly={readOnly || undefined}
      // Native focusout (not CodeMirror's deferred focus tracking), so a save on blur runs at once.
      onBlur={(e) => {
        if (host.current?.contains(e.relatedTarget as Node | null)) return;
        latest.current.onBlur?.(viewRef.current?.state.doc.toString() ?? '');
      }}
    />
  );
});
