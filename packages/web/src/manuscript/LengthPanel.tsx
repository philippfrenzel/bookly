/**
 * Length tab: the author sets the book's target word range (used as guidance for AI drafts);
 * reviewers see it read-only.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WORD_RANGE_MAX } from '@bookly/shared';
import type { BookPatchBody, Id, ManuscriptResponse, WordRange } from '@bookly/shared';
import { api } from '../api/client';
import { manuscriptError } from './manuscriptApi';

const fmt = (n: number) => n.toLocaleString('de-DE');
const RANGE_ERROR = `Bitte ganze Zahlen zwischen 1 und ${fmt(WORD_RANGE_MAX)} eingeben.`;

/** The length tab. */
export function LengthPanel({ bookId, ms }: { bookId: Id; ms: ManuscriptResponse }) {
  const range = ms.book.targetWords;
  if (ms.role !== 'author') {
    return <p className={range ? undefined : 'muted'}>{range ? `Etwa ${fmt(range.min)}–${fmt(range.max)} Wörter` : 'Kein Zielumfang festgelegt.'}</p>;
  }
  return <LengthEditor bookId={bookId} range={range} />;
}

/** Parses an input as a whole number within the allowed range, else null. */
function parseWords(v: string): number | null {
  if (!/^\d+$/.test(v.trim())) return null;
  const n = Number(v);
  return n >= 1 && n <= WORD_RANGE_MAX ? n : null;
}

/** Author editor for the word range. */
function LengthEditor({ bookId, range }: { bookId: Id; range: WordRange | null }) {
  const qc = useQueryClient();
  const [min, setMin] = useState(range ? String(range.min) : '');
  const [max, setMax] = useState(range ? String(range.max) : '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setMin(range ? String(range.min) : ''); setMax(range ? String(range.max) : ''); }, [range?.min, range?.max]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = useMutation({
    mutationFn: (body: BookPatchBody) => api('PATCH', `/api/books/${bookId}`, body),
    onSuccess: () => { setSaved(true); return qc.invalidateQueries({ queryKey: ['manuscript', bookId] }); },
  });
  const send = (targetWords: WordRange | null) => { setSaved(false); patch.mutate({ targetWords }); };
  const save = (e: FormEvent) => {
    e.preventDefault();
    const lo = parseWords(min);
    const hi = parseWords(max);
    if (lo === null || hi === null) return setError(RANGE_ERROR);
    if (lo > hi) return setError('Von darf nicht größer als bis sein.');
    setError(null);
    send({ min: lo, max: hi });
  };
  const remove = () => { setError(null); setMin(''); setMax(''); send(null); };
  return (
    <form className="ms-panel" onSubmit={save} aria-label="Zielumfang des Buchs">
      <p className="muted">Der Zielumfang dient der KI als Richtwert, wenn sie Entwürfe in „passend zum Buch“ schreibt.</p>
      <label>Wörter von<input type="number" inputMode="numeric" min={1} max={WORD_RANGE_MAX} value={min} onChange={(e) => { setSaved(false); setMin(e.target.value); }} /></label>
      <label>Wörter bis<input type="number" inputMode="numeric" min={1} max={WORD_RANGE_MAX} value={max} onChange={(e) => { setSaved(false); setMax(e.target.value); }} /></label>
      <div className="actions">
        <button type="submit" className="primary" disabled={patch.isPending}>Speichern</button>
        {range && <button type="button" disabled={patch.isPending} onClick={remove}>Entfernen</button>}
        {saved && <span className="ms-info" role="status">Gespeichert.</span>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {patch.isError && <p className="error" role="alert">{manuscriptError(patch.error)}</p>}
    </form>
  );
}
