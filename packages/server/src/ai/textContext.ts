/** Builds the JSON context sent to the model for an AI text request, from the stored book plus unsaved draft values. */
import { draftHasText } from '@bookly/shared';
import type { AiTextBody, AiTextDraft, Book, Character, Section, Storyline, TimeRange } from '@bookly/shared';
import { NotFoundError } from '../errors.js';

/** Context for one text request. */
export interface TextContext {
  /** German label of the targeted field. */
  fieldLabel: string;
  /** JSON-ready context object. */
  context: Record<string, unknown>;
  /** True when the owning object has text besides the target field. */
  hasText: boolean;
}

const CONNECTION_LABELS: Record<string, string> = {
  character_switch: 'Figur wechselt',
  time_jump: 'Zeitsprung',
  merge: 'Handlungsstränge vereinigen sich',
  flashback: 'Rückblende',
};

const FIELD_LABELS: Record<string, string> = {
  title: 'Titel',
  note: 'Notiz',
  name: 'Name',
  behavior: 'Verhalten',
  intentions: 'Absichten',
  label: 'Beschriftung',
};

/** Returns the stored value, or '' when null. */
const str = (v: string | null | undefined): string => v ?? '';

function need<T>(v: T | undefined): T {
  if (v === undefined) throw new NotFoundError();
  return v;
}

function timeRange(book: Book, range: TimeRange | null): string | null {
  if (!range) return null;
  const name = (id: string) => book.timePoints.find((t) => t.id === id)?.name ?? '';
  return `${name(range.startId)} – ${name(range.endId)}`;
}

function characterList(book: Book, ids: string[]): { name: string; beschreibung: string }[] {
  return ids
    .map((id) => book.characters.find((c) => c.id === id))
    .filter((c): c is Character => c !== undefined)
    .map((c) => ({ name: str(c.name), beschreibung: str(c.description) }));
}

const sortedSections = (s: Storyline): Section[] => [...s.sections].sort((a, b) => a.order - b.order);

function sectionList(s: Storyline) {
  return sortedSections(s).map((x) => ({ titel: x.title, beschreibung: x.description }));
}

function storylineContext(book: Book, stored: Storyline | undefined, draft: AiTextDraft) {
  const storyline = {
    titel: draft.title ?? stored?.title ?? '',
    beschreibung: draft.description ?? stored?.description ?? '',
    notiz: draft.note ?? str(stored?.note),
    art: stored?.kind ?? null,
    status: stored?.status ?? null,
    zeitraum: timeRange(book, stored?.range ?? null),
    abschnitte: stored ? sectionList(stored) : [],
  };
  return { buch: book.title, storyline, figuren: characterList(book, draft.characterIds ?? stored?.characterIds ?? []) };
}

const brief = (s: Pick<Storyline, 'title' | 'description'> | undefined) =>
  s ? { titel: s.title, beschreibung: s.description } : null;

function fieldLabel(target: AiTextBody['target']): string {
  if (target.field === 'description') return target.kind === 'character' ? 'Beschreibung' : 'Kurzbeschreibung';
  return FIELD_LABELS[target.field] ?? target.field;
}

/** Builds the model context for `body`; throws NotFoundError when a referenced id is not part of `book`. */
export function buildTextContext(book: Book, body: AiTextBody): TextContext {
  const { target, draft } = body;
  const label = fieldLabel(target);
  const findStoryline = (id: string) => need(book.storylines.find((s) => s.id === id));
  const findCharacter = (id: string) => need(book.characters.find((c) => c.id === id));

  switch (target.kind) {
    case 'storyline': {
      const stored = target.storylineId === null ? undefined : findStoryline(target.storylineId);
      const merged: AiTextDraft = {
        title: stored?.title,
        description: stored?.description,
        note: str(stored?.note),
        characterIds: stored?.characterIds,
        ...Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== undefined)),
      };
      return { fieldLabel: label, context: storylineContext(book, stored, draft), hasText: draftHasText(target, merged) };
    }
    case 'section': {
      const parent = findStoryline(target.storylineId);
      const sections = sortedSections(parent);
      const stored = target.sectionId === null ? undefined : need(sections.find((s) => s.id === target.sectionId));
      const index = stored ? sections.indexOf(stored) : sections.length;
      const abschnitt = {
        titel: draft.title ?? stored?.title ?? '',
        beschreibung: draft.description ?? stored?.description ?? '',
        notiz: draft.note ?? str(stored?.note),
        zeitraum: timeRange(book, stored?.range ?? null),
        figuren: characterList(book, draft.characterIds ?? stored?.characterIds ?? []),
      };
      const merged: AiTextDraft = {
        title: abschnitt.titel,
        description: abschnitt.beschreibung,
        note: abschnitt.notiz,
        characterIds: draft.characterIds ?? stored?.characterIds,
      };
      return {
        fieldLabel: label,
        context: {
          ...storylineContext(book, parent, {}),
          abschnitt,
          vorher: brief(sections[index - 1]),
          nachher: brief(sections[index + 1]),
        },
        hasText: draftHasText(target, merged),
      };
    }
    case 'character': {
      const stored = findCharacter(target.characterId);
      const figur = {
        name: draft.name ?? str(stored.name),
        beschreibung: draft.description ?? str(stored.description),
        verhalten: draft.behavior ?? str(stored.behavior),
        absichten: draft.intentions ?? str(stored.intentions),
      };
      const merged: AiTextDraft = {
        name: figur.name,
        description: figur.beschreibung,
        behavior: figur.verhalten,
        intentions: figur.absichten,
      };
      const storylines = book.storylines.filter((s) => s.characterIds.includes(stored.id)).map((s) => s.title);
      return { fieldLabel: label, context: { buch: book.title, figur, storylines }, hasText: draftHasText(target, merged) };
    }
    case 'addition': {
      const storyline = findStoryline(target.storylineId);
      const character = findCharacter(target.characterId);
      if (!storyline.characterIds.includes(character.id)) throw new NotFoundError();
      const addition = storyline.additions.find((a) => a.characterId === character.id);
      return {
        fieldLabel: label,
        context: {
          grundprofil: {
            name: str(character.name),
            beschreibung: str(character.description),
            verhalten: str(character.behavior),
            absichten: str(character.intentions),
          },
          storyline: {
            titel: storyline.title,
            beschreibung: storyline.description,
            notiz: str(storyline.note),
            abschnitte: sectionList(storyline),
          },
          ergaenzung: {
            verhalten: draft.behavior ?? str(addition?.behavior),
            absichten: draft.intentions ?? str(addition?.intentions),
          },
          hinweis: 'Nur Abweichungen vom Grundprofil beschreiben.',
        },
        hasText: true,
      };
    }
    case 'connection': {
      const from = findStoryline(target.fromId);
      const to = findStoryline(target.toId);
      const character = target.characterId === null ? undefined : findCharacter(target.characterId);
      return {
        fieldLabel: label,
        context: {
          typ: CONNECTION_LABELS[target.type] ?? target.type,
          von: brief(from),
          nach: brief(to),
          ...(character ? { figur: str(character.name) } : {}),
        },
        hasText: true,
      };
    }
  }
}
