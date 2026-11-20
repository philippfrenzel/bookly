/** Lists contradiction hints of one connection; acknowledged hints are muted. */
import type { Hint } from '@bookly/shared';

interface Props {
  hints: Hint[];
  /** When given, unacknowledged hints get a „Bewusst so“ button. */
  onAcknowledge?: (hint: Hint) => void;
  /** When given, acknowledged hints get a „Wieder anzeigen“ button. */
  onReopen?: (hint: Hint) => void;
}

/** Heading plus one entry per hint, or the all-clear message. */
export function HintList({ hints, onAcknowledge, onReopen }: Props) {
  return (
    <section className="hint-list" aria-label="Hinweise">
      <h3>Hinweise</h3>
      {hints.length === 0 ? (
        <p className="muted">Keine Widersprüche gefunden.</p>
      ) : (
        <ul>
          {hints.map((h) => (
            <li key={`${h.rule}:${h.characterId ?? ''}`} className={h.acknowledged ? 'hint is-acknowledged' : 'hint'}>
              <span>{h.message}</span>
              {!h.acknowledged && onAcknowledge && (
                <button type="button" onClick={() => onAcknowledge(h)}>Bewusst so</button>
              )}
              {h.acknowledged && onReopen && (
                <button type="button" onClick={() => onReopen(h)}>Wieder anzeigen</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
