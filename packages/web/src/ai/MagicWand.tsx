/**
 * The AI "magic wand" for one text field: action menu, request, and a suggestion bar.
 * On a native input the suggestion is written in place; on a ProseField (CodeMirror) it is shown as a
 * change over the text and only written when the author accepts it.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { draftHasText, fieldLimit, fitSuggestion, targetRange } from '@bookly/shared';
import type { AiTextAction, AiTextBody, AiTextDraft, AiTextResult, AiTextTarget, Id, LengthChoice } from '@bookly/shared';
import { api } from '../api/client';
import { Icon } from '../ui/Icon';
import { isProse } from '../editor/ProseField';
import type { ProseHandle } from '../editor/ProseField';
import { replaceRange } from './replaceRange';
import { menuItems } from './wandState';
import type { MenuItem } from './wandState';

type Native = HTMLInputElement | HTMLTextAreaElement;
type Field = Native | ProseHandle;
type Selection = { start: number; end: number } | null;

/** Props of the magic wand; the caller wraps the field and the wand in one `div.wand-field`. */
export interface MagicWandProps {
  getField: () => Field | null;
  bookId: Id;
  target: AiTextTarget;
  /** Values of the owning object's other fields (unsaved ones included); omitted → {}. */
  draft?: () => AiTextDraft;
  /** BookResponse.ai.enabled */
  enabled: boolean;
  /** Used in aria-labels. */
  fieldLabel: string;
  /** Wanted length of generated text; sent only when set, so other fields' bodies stay as before. */
  length?: LengthChoice;
}

interface MenuState {
  items: MenuItem[];
  hint: string | null;
  selection: Selection;
}

interface BarState {
  original: string;
  start: number;
  currentLength: number;
  index: number;
  suggestions: string[];
  /** The field's full value as the wand last left it; bar operations only act on a field that still shows it. */
  shown: string;
  /** True on a ProseField: the suggestion is an overlay held by the editor, not text in the field. */
  prose: boolean;
}

const FAILED = 'Vorschlag fehlgeschlagen.';

/** Keeps the field's focus and selection when a wand control is pressed with the mouse. */
const keepFocus = (e: ReactMouseEvent) => e.preventDefault();

/** Wand button with its action menu and the suggestion bar (◀ 1/3 ▶ ↶ ✕) for one field. */
export function MagicWand({ getField, bookId, target, draft, enabled, fieldLabel, length }: MagicWandProps): JSX.Element {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [bar, setBar] = useState<BarState | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  /** True while the wand itself writes into the field, so its own `input` events do not close the bar. */
  const applying = useRef(false);
  const hintId = useId();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const wrapper = (): HTMLElement | null => buttonRef.current?.closest<HTMLElement>('.wand-field') ?? buttonRef.current?.parentElement ?? null;

  /** Writes into the field without triggering the "user typed" close. */
  const apply = (el: Native, start: number, end: number, value: string) => {
    applying.current = true;
    try {
      replaceRange(el, start, end, value);
    } finally {
      applying.current = false;
    }
  };

  /**
   * The current field if it still shows what the wand left in it. The field may have been
   * remounted meanwhile (edit forms key it on the stored value), so it is re-resolved each time.
   */
  const barField = (): Field | null => {
    const el = getField();
    if (!el || !bar) return null;
    if (isProse(el)) return el.suggestion() ? el : null;
    return el.value === bar.shown ? el : null;
  };

  const switchBy = (delta: number) => {
    const el = barField();
    if (el && isProse(el)) {
      el.cycle(delta);
      return;
    }
    if (!el || !bar) {
      setBar(null);
      return;
    }
    const n = bar.suggestions.length;
    const index = (bar.index + delta + n) % n;
    const next = bar.suggestions[index]!;
    apply(el, bar.start, bar.start + bar.currentLength, next);
    setBar({ ...bar, index, currentLength: next.length, shown: el.value });
  };

  const restore = () => {
    const el = barField();
    if (el && isProse(el)) el.reject();
    else if (el && bar) apply(el, 0, el.value.length, bar.original);
    setBar(null);
  };

  /** ProseField only: writes the shown suggestion into the text. */
  const accept = () => {
    const el = barField();
    if (el && isProse(el)) el.accept();
    setBar(null);
  };

  // ProseField: the editor owns the suggestion (Tab, Esc, Alt+arrows and typing act on it there);
  // the bar follows it and closes once it is accepted or discarded.
  const proseBar = bar?.prose ?? false;
  useEffect(() => {
    if (!proseBar) return;
    const el = getField();
    if (!el || !isProse(el)) return;
    return el.subscribe((s) => {
      if (!mounted.current) return;
      if (!s) setBar(null);
      else setBar((b) => (b ? { ...b, index: s.index } : b));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proseBar]);

  // While the bar is open: keys on the field, typing, clicks outside and leaving the field.
  useEffect(() => {
    const field = getField();
    const box = wrapper();
    if (!bar || bar.prose || !field || isProse(field) || !box) return;
    const el: HTMLElement = field;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        restore();
      } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        e.stopPropagation();
        switchBy(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    const onInput = () => {
      if (!applying.current) setBar(null);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!box.contains(e.target as Node)) setBar(null);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!box.contains(e.relatedTarget as Node | null)) setBar(null);
    };
    el.addEventListener('keydown', onKey);
    el.addEventListener('input', onInput);
    document.addEventListener('mousedown', onMouseDown, true);
    box.addEventListener('focusout', onFocusOut);
    return () => {
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('input', onInput);
      document.removeEventListener('mousedown', onMouseDown, true);
      box.removeEventListener('focusout', onFocusOut);
    };
  });

  // While the menu is open: focus its first enabled item and close it on a click outside.
  const menuOpen = menu !== null;
  useEffect(() => {
    if (!menuOpen) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
    (first ?? menuRef.current)?.focus();
    const onMouseDown = (e: MouseEvent) => {
      if (!wrapper()?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, [menuOpen]);

  const toggleMenu = () => {
    if (menu) {
      setMenu(null);
      return;
    }
    const el = getField();
    if (!el) return;
    setBar(null);
    setMessage(null);
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selection = start === end ? null : { start, end };
    const contextHasText = draftHasText(target, draft?.() ?? {});
    setMenu({ ...menuItems({ text: el.value, selection, target, contextHasText }), selection });
  };

  const closeMenu = () => {
    setMenu(null);
    buttonRef.current?.focus();
  };

  const send = async (action: AiTextAction) => {
    const el = getField();
    if (!el || !menu) return;
    const { selection } = menu;
    const text = el.value;
    setMenu(null);
    setLoading(true);
    el.focus();
    // The live value replaces a possibly stale stored one of the target field in the context.
    const context: AiTextDraft = { ...(draft?.() ?? {}) };
    if (target.field !== 'label' && target.field !== 'text') context[target.field] = text;
    const body: AiTextBody = { target, action, text, selection, draft: context, ...(length ? { length } : {}) };
    let result: AiTextResult;
    try {
      result = await api<AiTextResult>('POST', `/api/books/${bookId}/ai/text`, body);
    } catch {
      if (mounted.current) {
        setLoading(false);
        setMessage(FAILED);
      }
      return;
    }
    if (!mounted.current) return;
    setLoading(false);
    // Opening the menu blurred the field, so an edit form may have saved and remounted it during
    // the request: use the field that is there now, and only if it still holds the sent text.
    const cur = getField();
    if (!cur || cur.value !== text) return;
    // The user went on elsewhere: inserting would steal focus. A remount leaves focus on <body>.
    const active = document.activeElement;
    if (active && active !== document.body && !wrapper()?.contains(active)) return;
    const range = targetRange(action, text, selection);
    const limit = fieldLimit(target);
    const suggestions = result.suggestions.map((s) => fitSuggestion(s, text, range, limit, action)).filter((s) => s !== '');
    if (suggestions.length === 0) {
      setMessage('Kein Vorschlag.');
      return;
    }
    if (isProse(cur)) {
      cur.suggest(range.start, range.end, suggestions);
      setBar({ original: text, start: range.start, currentLength: range.end - range.start, index: 0, suggestions, shown: text, prose: true });
      return;
    }
    apply(cur, range.start, range.end, suggestions[0]!);
    setBar({ original: text, start: range.start, currentLength: suggestions[0]!.length, index: 0, suggestions, shown: cur.value, prose: false });
  };

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusAt(at + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusAt(at < 0 ? -1 : at - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(-1);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        break;
      case 'Tab':
        setMenu(null);
        break;
    }
  };

  const onBarKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    restore();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={loading ? 'wand-button icon-button is-loading' : 'wand-button icon-button'}
        aria-label={`KI-Assistent: ${fieldLabel}`}
        title={enabled ? 'KI-Assistent' : 'KI nicht eingerichtet'}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-busy={loading || undefined}
        disabled={!enabled || loading}
        onMouseDown={keepFocus}
        onClick={toggleMenu}
      >
        <Icon name="wand" />
      </button>
      {menu && (
        <div className="wand-menu">
          <div
            ref={menuRef}
            role="menu"
            tabIndex={-1}
            aria-label={`KI-Assistent: ${fieldLabel}`}
            aria-describedby={menu.hint ? hintId : undefined}
            onKeyDown={onMenuKeyDown}
            onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setMenu(null)}
          >
            {menu.items.map((item) => (
              <button key={item.action} type="button" role="menuitem" disabled={item.disabled} onClick={() => void send(item.action)}>
                {item.label}
              </button>
            ))}
          </div>
          {menu.hint && (
            <p id={hintId} className="wand-hint">
              {menu.hint}
            </p>
          )}
        </div>
      )}
      {bar && (
        <div className="wand-bar" role="toolbar" aria-label={`Vorschläge: ${fieldLabel}`} onKeyDown={onBarKeyDown}>
          <button type="button" className="icon-button" aria-label="Vorheriger Vorschlag" disabled={bar.suggestions.length < 2} onMouseDown={keepFocus} onClick={() => switchBy(-1)}>
            <Icon name="prev" />
          </button>
          <span className="wand-count">
            {bar.index + 1}/{bar.suggestions.length}
          </span>
          <button type="button" className="icon-button" aria-label="Nächster Vorschlag" disabled={bar.suggestions.length < 2} onMouseDown={keepFocus} onClick={() => switchBy(1)}>
            <Icon name="next" />
          </button>
          {bar.prose ? (
            <>
              <button type="button" className="icon-button" aria-label="Vorschlag verwerfen" title="Verwerfen (Esc)" onMouseDown={keepFocus} onClick={restore}>
                <Icon name="close" />
              </button>
              <button type="button" className="wand-accept" aria-label="Vorschlag übernehmen" title="Übernehmen (Tab)" onMouseDown={keepFocus} onClick={accept}>
                <Icon name="check" /> Übernehmen
              </button>
            </>
          ) : (
            <>
              <button type="button" className="icon-button" aria-label="Rückgängig" onMouseDown={keepFocus} onClick={restore}>
                <Icon name="undo" />
              </button>
              <button type="button" className="icon-button" aria-label="Vorschläge schließen" onMouseDown={keepFocus} onClick={restore}>
                <Icon name="close" />
              </button>
            </>
          )}
        </div>
      )}
      <p role="status" className={message === FAILED ? 'wand-status is-error' : 'wand-status'}>
        {message}
      </p>
    </>
  );
}
