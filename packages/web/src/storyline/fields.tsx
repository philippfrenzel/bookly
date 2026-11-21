/** Field inputs that either commit live (create forms) or on blur/change (edit forms that save directly). */
import { useEffect, useRef, useState } from 'react';
import type { AiTextDraft, AiTextTarget, Id } from '@bookly/shared';
import { MagicWand } from '../ai/MagicWand';

interface TextProps {
  /** The stored value (edit) or the draft value (create). */
  value: string;
  multiline?: boolean;
  maxLength: number;
  ariaLabel?: string;
  /** True: every keystroke is committed (draft in a create form). False: commit on blur if changed. */
  live: boolean;
  /** Changes after a failed or rejected save so the field falls back to `value`. */
  resetKey: number;
  onCommit: (value: string) => void;
  /** Adds the AI wand next to the control. */
  ai?: { bookId: Id; target: AiTextTarget; draft?: () => AiTextDraft; enabled: boolean };
}

/** Text input or textarea; edit forms keep a local buffer and commit on blur. */
export function TextInput({ value, multiline, maxLength, ariaLabel, live, resetKey, onCommit, ai }: TextProps) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => setText(value), [value, resetKey]);
  const shared = {
    ref,
    value: text,
    maxLength,
    'aria-label': ariaLabel,
    onBlur: () => {
      if (!live && text !== value) onCommit(text);
    },
  };
  const change = (next: string) => {
    setText(next);
    if (live) onCommit(next);
  };
  const control = multiline ? (
    <textarea {...shared} onChange={(e) => change(e.target.value)} />
  ) : (
    <input {...shared} onChange={(e) => change(e.target.value)} />
  );
  if (!ai) return control;
  return (
    <div className="wand-field">
      {control}
      <MagicWand getField={() => ref.current} fieldLabel={ariaLabel ?? ''} {...ai} />
    </div>
  );
}

interface ColorProps {
  value: string;
  ariaLabel?: string;
  live: boolean;
  resetKey: number;
  onCommit: (value: string) => void;
}

/** Color input; edit forms commit on the native change event (picker closed), not while dragging. */
export function ColorInput({ value, ariaLabel, live, resetKey, onCommit }: ColorProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [color, setColor] = useState(value);
  useEffect(() => setColor(value), [value, resetKey]);
  const latest = useRef({ value, onCommit });
  latest.current = { value, onCommit };
  useEffect(() => {
    const el = ref.current;
    if (live || !el) return;
    const handler = () => {
      if (el.value !== latest.current.value) latest.current.onCommit(el.value);
    };
    el.addEventListener('change', handler);
    return () => el.removeEventListener('change', handler);
  }, [live]);
  return (
    <input
      ref={ref}
      type="color"
      aria-label={ariaLabel}
      value={color}
      onChange={(e) => {
        setColor(e.target.value);
        if (live) onCommit(e.target.value);
      }}
    />
  );
}
