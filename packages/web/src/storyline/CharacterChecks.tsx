/** Checkbox list for assigning book characters to a storyline or section; storylines add per-character editors. */
import { useState } from 'react';
import { characterLabel, type Character, type Id, type Storyline } from '@bookly/shared';
import { AdditionEditor } from './AdditionEditor';

interface Props {
  characters: Character[];
  value: Id[];
  onChange: (ids: Id[]) => void;
  /** A stored storyline: checked characters get an expandable addition editor. Omit for create mode and sections. */
  storyline?: Storyline;
  bookId?: Id;
  aiEnabled?: boolean;
  /** See {@link AdditionEditor}. */
  suggestTick?: number;
}

/** One checkbox per character; toggling adds or removes the id, unchecking asks first when an addition has text. */
export function CharacterChecks({ characters, value, onChange, storyline, bookId, aiEnabled = false, suggestTick = 0 }: Props) {
  const [open, setOpen] = useState<Id[]>([]);
  if (characters.length === 0) return <p className="muted">Noch keine Figuren.</p>;

  const additionOf = (id: Id) => storyline?.additions.find((a) => a.characterId === id);
  const toggle = (c: Character, checked: boolean) => {
    if (checked) return onChange([...value, c.id]);
    const a = additionOf(c.id);
    if (a && ((a.behavior ?? '').trim() || (a.intentions ?? '').trim()) && !window.confirm(`Ergänzung für ${characterLabel(c)} geht verloren. Entfernen?`)) return;
    onChange(value.filter((id) => id !== c.id));
  };
  const toggleOpen = (id: Id) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  return (
    <div className={storyline ? 'character-checks has-additions' : 'inline'}>
      {characters.map((c) => {
        const label = characterLabel(c);
        const checked = value.includes(c.id);
        const expanded = checked && open.includes(c.id);
        return (
          <div key={c.id} className="character-check">
            <label className="inline">
              <input type="checkbox" checked={checked} onChange={(e) => toggle(c, e.target.checked)} />
              {label}
            </label>
            {storyline && bookId && checked && (
              <button
                type="button"
                className="link-button"
                aria-expanded={expanded}
                aria-label={`Ergänzung für ${label}`}
                onClick={() => toggleOpen(c.id)}
              >
                Ergänzung
              </button>
            )}
            {storyline && bookId && expanded && (
              <AdditionEditor
                bookId={bookId}
                storylineId={storyline.id}
                character={c}
                addition={additionOf(c.id)}
                aiEnabled={aiEnabled}
                suggestTick={suggestTick}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
