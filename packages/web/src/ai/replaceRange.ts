/** In-place text replacement for inputs that keeps the undo stack where possible and fires React onChange. */

/** Replaces `start`..`end` of `el` with `value` and selects the inserted text. */
export function replaceRange(el: HTMLInputElement | HTMLTextAreaElement, start: number, end: number, value: string): void {
  const expected = el.value.slice(0, start) + value + el.value.slice(end);
  el.focus();
  el.setSelectionRange(start, end);
  const inserted = typeof document.execCommand === 'function' && document.execCommand('insertText', false, value);
  if (!inserted || el.value !== expected) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    if (setter) setter.call(el, expected);
    else el.value = expected;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  el.setSelectionRange(start, start + value.length);
}
