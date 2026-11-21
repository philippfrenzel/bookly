/** Pure menu state for the AI magic wand: which actions are offered and which are enabled. */
import { fieldLimit, MIN_CONTINUE_ROOM, MIN_SELECTION } from '@bookly/shared';
import type { AiTextAction, AiTextTarget } from '@bookly/shared';

/** One entry of the wand menu. */
export interface MenuItem {
  action: AiTextAction;
  label: string;
  disabled: boolean;
}

/** Hint shown when "generate" has no context to work from. */
function contextHint(target: AiTextTarget): string {
  return target.kind === 'character' ? 'Erst Name oder Beschreibung eingeben.' : 'Erst Titel oder Beschreibung eingeben.';
}

/** Menu items and an optional hint for the current field text, selection and target. */
export function menuItems(input: {
  text: string;
  selection: { start: number; end: number } | null;
  target: AiTextTarget;
  contextHasText: boolean;
}): { items: MenuItem[]; hint: string | null } {
  const { text, selection, target, contextHasText } = input;
  if (text.trim() === '') {
    return {
      items: [{ action: 'generate', label: 'Vorschlagen', disabled: !contextHasText }],
      hint: contextHasText ? null : contextHint(target),
    };
  }
  const tooShort = selection !== null && text.slice(selection.start, selection.end).trim().length < MIN_SELECTION;
  const noRoom = fieldLimit(target).max - text.length < MIN_CONTINUE_ROOM;
  return {
    items: [
      { action: 'rephrase', label: 'Umformulieren', disabled: tooShort },
      { action: 'continue', label: 'Fortsetzen', disabled: tooShort || noRoom },
      { action: 'polish', label: 'Stil verbessern', disabled: tooShort },
    ],
    hint: tooShort ? 'Markierung zu kurz.' : null,
  };
}
