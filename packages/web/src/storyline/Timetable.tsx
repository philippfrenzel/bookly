/**
 * „Fahrplan“ below the map: the selected storyline laid out on the book's time points. Shows its sections,
 * the scenes they play in, which character is present when, and its connections; every entry opens the matching place in the side panel.
 */
import { characterLabel, orderIndex, type Book, type CharacterWarning, type Id, type Scene, type SceneAssignment, type Storyline, type TimeRange } from '@bookly/shared';
import { CONNECTION_TYPES } from '../connection/ConnectionDialog';
import { signetOf, SignetChip } from './StorylineHeader';

interface Props {
  book: Book;
  storyline: Storyline;
  /** AI character warnings of the book; open ones of this storyline mark the character. */
  warnings: CharacterWarning[];
  /** Scenes of the book and their section assignments; assigned scenes are named on the section cards. */
  scenes?: Scene[];
  sceneAssignments?: SceneAssignment[];
  /** Opens a section (null: the add form) in the „Zeitpunkte“ tab. */
  onOpenSection: (sectionId: Id | null) => void;
  /** Opens the „Figuren“ tab. */
  onOpenCharacters: () => void;
  onOpenConnection: (connectionId: Id) => void;
}

/** Column span [start, end] (0-based, inclusive) of a range on the sorted time points. */
type Span = [number, number];

/** Greedy lane packing so overlapping sections get their own row. */
export function packLanes<T extends { span: Span }>(items: T[]): (T & { lane: number })[] {
  const laneEnds: number[] = [];
  return [...items]
    .sort((a, b) => a.span[0] - b.span[0] || a.span[1] - b.span[1])
    .map((item) => {
      let lane = laneEnds.findIndex((end) => end < item.span[0]);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = item.span[1];
      return { ...item, lane };
    });
}

/** Contiguous runs of covered columns, e.g. {0,1,3} → [[0,1],[3,3]]. */
export function runsOf(columns: Set<number>): Span[] {
  const sorted = [...columns].sort((a, b) => a - b);
  const runs: Span[] = [];
  for (const c of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[1] === c - 1) last[1] = c;
    else runs.push([c, c]);
  }
  return runs;
}

/** Grid placement of a span after the label column. */
const place = ([a, b]: Span, row?: number) => ({ gridColumn: `${a + 2} / ${b + 3}`, gridRow: row });

/** Renders the timetable of one storyline. */
export function Timetable({ book, storyline, warnings, scenes = [], sceneAssignments = [], onOpenSection, onOpenCharacters, onOpenConnection }: Props) {
  const points = [...book.timePoints].sort((a, b) => a.position - b.position);
  const idx = orderIndex(points);
  const spanOf = (r: TimeRange): Span => {
    const a = idx.get(r.startId) ?? 0;
    const b = idx.get(r.endId) ?? a;
    return [Math.min(a, b), Math.max(a, b)];
  };
  const own = spanOf(storyline.range);
  const sections = packLanes(storyline.sections.map((s) => ({ s, span: spanOf(s.range) })));
  const lanes = Math.max(1, ...sections.map((x) => x.lane + 1));
  const openWarnings = warnings.filter((w) => w.storylineId === storyline.id && !w.acknowledged);
  const connections = book.connections.filter((c) => c.fromId === storyline.id || c.toId === storyline.id);
  // Characters in the book's own order, not in the order they were ticked.
  const people = book.characters.filter((c) => storyline.characterIds.includes(c.id));
  const sceneName = new Map(scenes.map((sc) => [sc.id, sc.name]));
  /** Names of the scenes assigned to a section, in assignment order. */
  const scenesOf = (sectionId: Id) =>
    sceneAssignments.filter((a) => a.sectionId === sectionId).map((a) => sceneName.get(a.sceneId)).filter((n): n is string => !!n);
  const grid = { gridTemplateColumns: `minmax(5rem, 8.5rem) repeat(${points.length}, minmax(5.5rem, 1fr))` };

  /** Columns where a character appears: its sections, or the whole storyline when no section names it. */
  const presence = (characterId: Id): { runs: Span[]; viaSections: boolean } => {
    const cols = new Set<number>();
    for (const { s, span } of sections) {
      if (s.characterIds.includes(characterId)) for (let i = span[0]; i <= span[1]; i++) cols.add(i);
    }
    if (cols.size > 0) return { runs: runsOf(cols), viaSections: true };
    return { runs: [own], viaSections: false };
  };

  return (
    <section className="timetable" aria-label="Fahrplan der Storyline" style={{ ['--line' as string]: storyline.color }}>
      <header className="timetable-head">
        <SignetChip color={storyline.color} signet={signetOf(book, storyline.id)} />
        <h2>Fahrplan von {storyline.title}</h2>
        <p className="muted">Was passiert wann, und wer ist dabei. Ein Klick öffnet es rechts.</p>
      </header>
      <div className="timetable-scroll">
        <div className="timetable-grid" style={grid}>
          <span />
          {points.map((p, i) => (
            <span key={p.id} className={`timetable-point${i < own[0] || i > own[1] ? ' is-outside' : ''}`}>{p.name}</span>
          ))}
        </div>

        <h3 className="timetable-label">Abschnitte</h3>
        <div className="timetable-grid" style={grid} role="group" aria-label="Abschnitte im Fahrplan">
          <span style={{ gridColumn: 1, gridRow: `1 / span ${lanes}` }} />
          {storyline.kind === 'side' && (
            <span className="timetable-empty" style={place(own, 1)}>Nebenstränge haben keine Abschnitte.</span>
          )}
          {storyline.kind === 'main' && sections.length === 0 && (
            <button type="button" className="timetable-empty is-action" style={place(own, 1)} onClick={() => onOpenSection(null)}>
              Noch keine Abschnitte. Ersten Abschnitt anlegen
            </button>
          )}
          {sections.map(({ s, span, lane }) => (
            <button
              key={s.id}
              type="button"
              className="timetable-section"
              style={place(span, lane + 1)}
              aria-label={`Abschnitt „${s.title}“ öffnen`}
              onClick={() => onOpenSection(s.id)}
            >
              <strong>{s.title}</strong>
              {s.description && <span className="muted">{s.description}</span>}
              {scenesOf(s.id).length > 0 && (
                <span className="timetable-scenes">
                  {scenesOf(s.id).map((n) => <span key={n} className="scene-chip">{n}</span>)}
                </span>
              )}
            </button>
          ))}
        </div>

        <h3 className="timetable-label">Figuren</h3>
        <div className="timetable-grid" style={grid} role="group" aria-label="Figuren im Verlauf">
          {people.length === 0 && (
            <button type="button" className="timetable-empty is-action" style={place(own, 1)} onClick={onOpenCharacters}>
              Noch keine Figuren zugeordnet
            </button>
          )}
          {people.map((c, row) => {
            const cid = c.id;
            const { runs, viaSections } = presence(cid);
            const warned = openWarnings.some((w) => w.characterId === cid);
            return [
              <button key={`${cid}-name`} type="button" className="timetable-character" style={{ gridColumn: 1, gridRow: row + 1 }} onClick={onOpenCharacters}>
                {characterLabel(c)}
                {warned && <span className="timetable-warning">KI-Hinweis</span>}
              </button>,
              ...runs.map((r) => (
                <span
                  key={`${cid}-${r[0]}`}
                  className={`timetable-presence${viaSections ? '' : ' is-loose'}`}
                  style={place(r, row + 1)}
                  title={viaSections ? `${characterLabel(c)} in Abschnitten dabei` : `${characterLabel(c)} in der Storyline, keinem Abschnitt zugeordnet`}
                />
              )),
            ];
          })}
        </div>
      </div>

      <div className="timetable-connections" role="group" aria-label="Verbindungen im Fahrplan">
        <h3 className="timetable-label">Verbindungen</h3>
        {connections.length === 0 && <span className="muted">Keine</span>}
        {connections.map((c) => {
          const otherId = c.fromId === storyline.id ? c.toId : c.fromId;
          const other = book.storylines.find((s) => s.id === otherId);
          const type = CONNECTION_TYPES.find((t) => t.type === c.type)?.label ?? c.type;
          return (
            <button key={c.id} type="button" className="line-chip" onClick={() => onOpenConnection(c.id)}>
              <span aria-hidden="true">{c.fromId === storyline.id ? '→' : '←'}</span>
              {other && <SignetChip color={other.color} signet={signetOf(book, other.id)} />}
              {other?.title ?? '?'}
              <span className="muted">· {c.label ?? type}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
