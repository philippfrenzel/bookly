/** Catalogue of AI character criteria and the character label helper. */

export type CharacterCriterion = 'behavior_change' | 'intention_conflict' | 'relationship_conflict';

export const CRITERIA_VERSION = 1;

/** AI criteria: key, German UI label, and description used in the prompt. */
export const CHARACTER_CRITERIA: readonly { key: CharacterCriterion; label: string; description: string }[] = [
  {
    key: 'behavior_change',
    label: 'Verhalten weicht ab',
    description: 'Das Verhalten der Figur weicht vom gültigen Verhaltensmuster ab, ohne dass eine Ergänzung das abdeckt.',
  },
  {
    key: 'intention_conflict',
    label: 'Widersprüchliche Absichten',
    description: 'Das Handeln der Figur widerspricht den gültigen Absichten, oder die Absichten widersprechen sich.',
  },
  {
    key: 'relationship_conflict',
    label: 'Widerspruch in Beziehungen',
    description: 'Es besteht ein Widerspruch zu Beziehungen zwischen Figuren, wie sie in den Steckbriefen beschrieben sind.',
  },
];

/** Display name of a character; unnamed characters read "Unbenannte Figur". */
export function characterLabel(c: { name: string | null } | undefined): string {
  return c?.name ?? 'Unbenannte Figur';
}
