/** Friendly German "last edited" phrases for the book list. */

const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' });
const dayMonthYear = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });

/** Whole calendar days between the local dates of `a` and `b` (b later → positive). */
function calendarDays(a: Date, b: Date): number {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/**
 * Describes when `iso` happened relative to `now`, e.g. „gerade eben“, „vor 5 Minuten“,
 * „heute, 09:14“, „gestern, 21:40“, „vor 3 Tagen“ or „am 3. Oktober“.
 */
export function editedAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return minutes === 1 ? 'vor 1 Minute' : `vor ${minutes} Minuten`;
  const days = calendarDays(then, now);
  if (days <= 0) return `heute, ${time.format(then)}`;
  if (days === 1) return `gestern, ${time.format(then)}`;
  if (days < 7) return `vor ${days} Tagen`;
  const fmt = then.getFullYear() === now.getFullYear() ? dayMonth : dayMonthYear;
  return `am ${fmt.format(then)}`;
}

/** „1 Handlungsstrang“ / „3 Handlungsstränge“ and the like. */
export function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
