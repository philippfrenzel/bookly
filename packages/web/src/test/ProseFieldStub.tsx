/**
 * Test stand-in for ProseField: a plain <textarea> with the same props. jsdom cannot edit a
 * contenteditable faithfully (spaces and selections get lost), so component tests type into this
 * stub, while ProseField itself is tested with the real editor (editor/*.test.tsx) and in e2e.
 */
import { forwardRef } from 'react';
import type { SyntheticEvent } from 'react';
import type { ProseFieldProps } from '../editor/ProseField';

/** Same props as ProseField; the ref is the textarea, so the magic wand takes its native path. */
export const ProseFieldStub = forwardRef<HTMLTextAreaElement, ProseFieldProps>(function ProseFieldStub(props, ref) {
  const { value, defaultValue, onChange, onBlur, onSelect, ariaLabel, placeholder, maxLength, readOnly, rows, className, id } = props;
  const select = onSelect ? (e: SyntheticEvent<HTMLTextAreaElement>) => onSelect(e.currentTarget.selectionStart, e.currentTarget.selectionEnd) : undefined;
  return (
    <textarea
      ref={ref}
      id={id}
      className={className}
      aria-label={ariaLabel}
      placeholder={placeholder}
      maxLength={maxLength}
      readOnly={readOnly}
      rows={rows}
      {...(value !== undefined ? { value } : { defaultValue })}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={(e) => onBlur?.(e.target.value)}
      onFocus={select}
      onSelect={select}
      onKeyUp={select}
      onClick={select}
    />
  );
});
