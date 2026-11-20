/** Status line and trigger for a storyline's AI character check. */
import type { CharacterCheck, Id } from '@bookly/shared';
import { useBookMutation } from '../api/hooks';

interface Props {
  bookId: Id;
  storylineId: Id;
  /** The check row of this storyline, if one exists. */
  check?: CharacterCheck;
  aiEnabled: boolean;
}

/** German „how long ago“ text for a finished check, computed at render time. */
function agoText(finishedAt: string | null): string {
  const minutes = finishedAt ? Math.floor((Date.now() - new Date(finishedAt).getTime()) / 60_000) : 0;
  return minutes < 1 ? 'Geprüft gerade eben' : `Geprüft vor ${minutes} min`;
}

/** Shows the check state above the character list and lets the author start a check. */
export function CheckStatus({ bookId, storylineId, check, aiEnabled }: Props) {
  const run = useBookMutation<void>(bookId, 'POST', () => `/api/books/${bookId}/storylines/${storylineId}/character-check`);
  const start = () => run.mutate();
  let status: React.ReactNode = null;
  if (!aiEnabled) status = 'KI nicht eingerichtet';
  else if (check?.status === 'pending' || check?.status === 'running') status = 'Prüfe Figuren…';
  else if (check?.status === 'done') status = agoText(check.finishedAt);
  else if (check?.status === 'failed') {
    status = (
      <>
        Prüfung fehlgeschlagen –{' '}
        <button type="button" className="link-button" onClick={start}>erneut versuchen</button>
      </>
    );
  }
  return (
    <div className="check-status">
      {status && <span className="muted" role="status">{status}</span>}
      <button type="button" disabled={!aiEnabled || run.isPending} onClick={start}>Figuren prüfen</button>
    </div>
  );
}
