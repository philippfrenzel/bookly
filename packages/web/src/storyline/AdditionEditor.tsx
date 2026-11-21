/** Per-storyline behavior and intentions of one character, with the base profile and an AI wand per field. */
import { useEffect, useRef, type FocusEvent } from 'react';
import { characterLabel, type Character, type CharacterAddition, type Id } from '@bookly/shared';
import { useBookMutation } from '../api/hooks';
import { useSaveFeedback } from '../book/saveFeedback';
import { MagicWand } from '../ai/MagicWand';

type Field = 'behavior' | 'intentions';

interface Props {
  bookId: Id;
  storylineId: Id;
  character: Character;
  addition?: CharacterAddition;
  aiEnabled: boolean;
  /** Registers a getter for the live textarea values (null on unmount), so the parent sees unsaved text. */
  registerLive?: (getter: (() => { behavior: string; intentions: string }) | null) => void;
}

/** Two textareas saved on blur (PUT addition), the greyed base profile and the AI wands. */
export function AdditionEditor({ bookId, storylineId, character: c, addition, aiEnabled, registerLive }: Props) {
  const label = characterLabel(c);
  const base = `/api/books/${bookId}/storylines/${storylineId}/characters/${c.id}`;
  const fb = useSaveFeedback();
  const save = useBookMutation<Partial<Record<Field, string>>>(bookId, 'PUT', () => `${base}/addition`, (x) => x);
  const areas = useRef<Partial<Record<Field, HTMLTextAreaElement | null>>>({});

  useEffect(() => {
    registerLive?.(() => ({ behavior: areas.current.behavior?.value ?? '', intentions: areas.current.intentions?.value ?? '' }));
    return () => registerLive?.(null);
  }, [registerLive]);

  const stored = (field: Field) => addition?.[field] ?? '';
  const write = (field: Field, value: string) => {
    fb.clear();
    save.mutate({ [field]: value }, { onError: fb.onError });
  };
  const onBlur = (field: Field) => (e: FocusEvent<HTMLTextAreaElement>) => {
    if (e.target.value !== stored(field)) write(field, e.target.value);
  };

  const profile = [c.behavior, c.intentions].filter((p): p is string => !!p && p.trim() !== '').join(' · ');
  const live = () => ({ behavior: areas.current.behavior?.value ?? '', intentions: areas.current.intentions?.value ?? '' });
  const textarea = (field: Field, title: string) => {
    const ariaLabel = `${title} Ergänzung ${label}`;
    return (
      <div className="field">
        <span>{title}</span>
        <div className="wand-field">
          <textarea
            aria-label={ariaLabel}
            key={`${field}-${stored(field)}-${fb.resetKey}`}
            maxLength={2000}
            ref={(el) => { areas.current[field] = el; }}
            defaultValue={stored(field)}
            onBlur={onBlur(field)}
          />
          <MagicWand
            getField={() => areas.current[field] ?? null}
            bookId={bookId}
            target={{ kind: 'addition', storylineId, characterId: c.id, field }}
            draft={live}
            enabled={aiEnabled}
            fieldLabel={ariaLabel}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="addition-editor">
      {profile && <p className="muted">Grundprofil: {profile}</p>}
      {textarea('behavior', 'Verhalten')}
      {textarea('intentions', 'Absichten')}
      {fb.feedback}
    </div>
  );
}
