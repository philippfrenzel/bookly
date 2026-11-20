/** Checkbox list for assigning book characters to a storyline or section. */
import { characterLabel, type Character, type Id } from '@bookly/shared';

interface Props {
  characters: Character[];
  value: Id[];
  onChange: (ids: Id[]) => void;
}

/** One checkbox per character; toggling adds or removes the id. */
export function CharacterChecks({ characters, value, onChange }: Props) {
  if (characters.length === 0) return <p className="muted">Noch keine Figuren.</p>;
  return (
    <div className="inline">
      {characters.map((c) => (
        <label key={c.id} className="inline">
          <input
            type="checkbox"
            checked={value.includes(c.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, c.id] : value.filter((id) => id !== c.id))}
          />
          {characterLabel(c)}
        </label>
      ))}
    </div>
  );
}
