/**
 * Style tab: the author picks predefined styles and team base styles for this work and adds their own notes
 * (FR-015, FR-016: per work only); team base styles are kept here too and apply to all works (FR-017).
 * Reviewers see the chosen style read-only.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { STYLE_LIMITS, STYLE_PRESETS } from '@bookly/shared';
import type { BookStyle, Id, ManuscriptResponse, TeamStyle } from '@bookly/shared';
import { api } from '../api/client';
import { Icon } from '../ui/Icon';
import { manuscriptError, useManuscriptMutation } from './manuscriptApi';

/** The style tab. */
export function StylePanel({ bookId, ms }: { bookId: Id; ms: ManuscriptResponse }) {
  if (ms.role !== 'author') return <StyleSummary ms={ms} />;
  return <StyleEditor bookId={bookId} ms={ms} />;
}

/** Read-only view for reviewers. */
function StyleSummary({ ms }: { ms: ManuscriptResponse }) {
  const presets = STYLE_PRESETS.filter((p) => ms.style.presetKeys.includes(p.key));
  if (presets.length === 0 && ms.teamStyles.length === 0 && !ms.style.addition) return <p className="muted">Für dieses Werk ist kein Stil festgelegt.</p>;
  return (
    <div className="ms-panel">
      <ul className="ms-style-summary">
        {[...presets, ...ms.teamStyles].map((s) => <li key={s.name}><strong>{s.name}</strong> <span className="muted">{s.description}</span></li>)}
      </ul>
      {ms.style.addition && <p><span className="scene-label">Ergänzung</span> {ms.style.addition}</p>}
    </div>
  );
}

/** Editor for the work's style and the team styles. */
function StyleEditor({ bookId, ms }: { bookId: Id; ms: ManuscriptResponse }) {
  const mutate = useManuscriptMutation(bookId);
  const [style, setStyle] = useState<BookStyle>(ms.style);
  const [saved, setSaved] = useState(false);
  useEffect(() => setStyle(ms.style), [ms.style]);
  const toggle = (list: 'presetKeys' | 'teamStyleIds', key: string) => {
    setSaved(false);
    setStyle((s) => ({ ...s, [list]: s[list].includes(key) ? s[list].filter((k) => k !== key) : [...s[list], key] }));
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    mutate.mutate({ method: 'PUT', path: '/style', body: style }, { onSuccess: () => setSaved(true) });
  };
  return (
    <div className="ms-panel">
      <form className="ms-panel" onSubmit={save} aria-label="Stil dieses Werks">
        <p className="muted">Der Stil gilt nur für dieses Werk. Die KI berücksichtigt ihn bei Entwürfen und Strukturvorschlägen.</p>
        <fieldset className="ms-style-list">
          <legend className="scene-label">Vordefinierte Stile</legend>
          {STYLE_PRESETS.map((p) => (
            <label key={p.key} className="ms-style-option">
              <input type="checkbox" checked={style.presetKeys.includes(p.key)} onChange={() => toggle('presetKeys', p.key)} />
              <span><strong>{p.name}</strong><span className="muted">{p.description}</span></span>
            </label>
          ))}
        </fieldset>
        {ms.teamStyles.length > 0 && (
          <fieldset className="ms-style-list">
            <legend className="scene-label">Grundstile des Teams</legend>
            {ms.teamStyles.map((t) => (
              <label key={t.id} className="ms-style-option">
                <input type="checkbox" checked={style.teamStyleIds.includes(t.id)} onChange={() => toggle('teamStyleIds', t.id)} />
                <span><strong>{t.name}</strong><span className="muted">{t.description}</span></span>
              </label>
            ))}
          </fieldset>
        )}
        <label>
          Eigene Ergänzungen
          <textarea rows={3} value={style.addition} maxLength={STYLE_LIMITS.addition} onChange={(e) => { setSaved(false); setStyle((s) => ({ ...s, addition: e.target.value })); }} placeholder="z. B. Dialoge im Dialekt, Kapitel enden ruhig" />
        </label>
        <div className="actions">
          <button type="submit" className="primary" disabled={mutate.isPending}>Stil speichern</button>
          {saved && <span className="ms-info" role="status">Gespeichert.</span>}
        </div>
        {mutate.isError && <p className="error" role="alert">{manuscriptError(mutate.error)}</p>}
      </form>
      <TeamStyles bookId={bookId} styles={ms.teamStyles} />
    </div>
  );
}

/** Team base styles: shared by all works of the author; add, change and remove (FR-017). */
function TeamStyles({ bookId, styles }: { bookId: Id; styles: TeamStyle[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [adding, setAdding] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['manuscript', bookId] });
  const create = useMutation({ mutationFn: (b: { name: string; description: string }) => api('POST', '/api/team-styles', b), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: Id) => api('DELETE', `/api/team-styles/${id}`), onSuccess: refresh });
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && description.trim()) create.mutate({ name: name.trim(), description: description.trim() }, { onSuccess: () => { setName(''); setDescription(''); setAdding(false); } });
  };
  return (
    <section className="ms-team-styles" aria-label="Grundstile des Teams">
      <h3>Grundstile des Teams</h3>
      <p className="muted">Grundstile stehen in allen deinen Werken zur Auswahl.</p>
      <ul className="panel-list">
        {styles.map((t) => (
          <li key={t.id} className="ms-team-style">
            <span><strong>{t.name}</strong> <span className="muted">{t.description}</span></span>
            <button type="button" className="icon-button" aria-label={`Grundstil ${t.name} löschen`} onClick={() => remove.mutate(t.id)}><Icon name="trash" /></button>
          </li>
        ))}
      </ul>
      {adding ? (
        <form className="ms-reviewer-form" onSubmit={add} aria-label="Neuer Grundstil">
          <label>Name<input value={name} maxLength={STYLE_LIMITS.name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Beschreibung<textarea rows={2} value={description} maxLength={STYLE_LIMITS.description} onChange={(e) => setDescription(e.target.value)} /></label>
          <div className="actions">
            <button type="submit" className="primary" disabled={create.isPending}>Anlegen</button>
            <button type="button" onClick={() => setAdding(false)}>Abbrechen</button>
          </div>
        </form>
      ) : (
        <button type="button" className="link-button with-icon" onClick={() => setAdding(true)}><Icon name="plus" />Grundstil hinzufügen</button>
      )}
      {(create.isError || remove.isError) && <p className="error" role="alert">Das hat nicht geklappt.</p>}
    </section>
  );
}
