/** One „Figuren“ warning in the hint list: click opens its storyline; „Bewusst so“ / „Wieder anzeigen“ are separate buttons. */
import { CHARACTER_CRITERIA, characterLabel, type Book, type CharacterWarning } from '@bookly/shared';
import { useBookMutation } from '../api/hooks';
import { useSaveFeedback } from './saveFeedback';

interface Props {
  book: Book;
  warning: CharacterWarning;
  onShowStoryline: (storylineId: string) => void;
}

/** Renders a warning with its title line, message, the acknowledge toggle (disabled while saving) and save errors. */
export function CharacterWarningItem({ book, warning, onShowStoryline }: Props) {
  const key = { storylineId: warning.storylineId, characterId: warning.characterId, criterion: warning.criterion };
  const ack = useBookMutation<typeof key>(book.id, 'POST', () => `/api/books/${book.id}/character-warning-acks`, (v) => v);
  const unack = useBookMutation<typeof key>(book.id, 'DELETE', () => `/api/books/${book.id}/character-warning-acks`, (v) => v);
  const fb = useSaveFeedback();
  const mutateOpts = { onError: fb.onError, onSuccess: fb.clear };
  const storyline = book.storylines.find((s) => s.id === warning.storylineId);
  const label = characterLabel(book.characters.find((c) => c.id === warning.characterId));
  const criterion = CHARACTER_CRITERIA.find((c) => c.key === warning.criterion)?.label ?? warning.criterion;

  const acknowledge = () => {
    if (!window.confirm(`Auch künftige Hinweise dieser Art für ${label} in dieser Storyline werden gedämpft.`)) return;
    ack.mutate(key, mutateOpts);
  };

  return (
    <li>
      <div
        className={`book-hint${warning.acknowledged ? ' is-acknowledged' : ''}`}
        onClick={() => onShowStoryline(warning.storylineId)}
      >
        <button type="button" className="book-hint-main">
          <span className="book-hint-route">{`${storyline?.title ?? '?'} · ${label} · ${criterion}`}</span>
          <span>{warning.message}</span>
        </button>
        <button
          type="button"
          className="book-hint-ack"
          disabled={ack.isPending || unack.isPending}
          onClick={(e) => {
            e.stopPropagation();
            if (warning.acknowledged) unack.mutate(key, mutateOpts);
            else acknowledge();
          }}
        >
          {warning.acknowledged ? 'Wieder anzeigen' : 'Bewusst so'}
        </button>
      </div>
      {fb.feedback}
    </li>
  );
}
