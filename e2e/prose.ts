/** Helpers for ProseField (CodeMirror) text fields in e2e tests: read their text and set the caret or selection. */
import { expect, type Locator } from '@playwright/test';

/** The field's text as the author sees it: lines joined by \n, without placeholder, AI suggestion overlay or grey continuation. */
export function proseText(field: Locator): Promise<string> {
  return field.evaluate((el) =>
    [...el.querySelectorAll('.cm-line')]
      .map((line) => {
        const copy = line.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('.cm-placeholder, .cm-ai-ins, .cm-ghost, .cm-widgetBuffer').forEach((n) => n.remove());
        return copy.textContent ?? '';
      })
      .join('\n'),
  );
}

/** Waits until the field holds exactly `text`. */
export async function expectProse(field: Locator, text: string): Promise<void> {
  await expect.poll(() => proseText(field)).toBe(text);
}

/**
 * Focuses the field and selects `from`..`to` (a caret when `to` is omitted), counted in characters
 * of its text. Uses the keyboard, the way an author moves the caret, so CodeMirror sees it as a real selection.
 */
export async function selectProse(field: Locator, from: number, to = from): Promise<void> {
  const keyboard = field.page().keyboard;
  await field.click();
  await keyboard.press('ControlOrMeta+Home');
  for (let i = 0; i < from; i++) await keyboard.press('ArrowRight');
  for (let i = from; i < to; i++) await keyboard.press('Shift+ArrowRight');
}
