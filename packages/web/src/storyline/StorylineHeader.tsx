/** Head of the storyline mode in the side panel: signet, title and facts, plus the sub-tabs Storyline · Figuren · Zeitpunkte · Szenen. */
import { STATUS_STYLE, orderIndex, type Book, type Storyline } from '@bookly/shared';
import { inkOn, lineSignets } from '../map/signets';

/** The groups a stored storyline is split into. */
export type StorylineTab = 'details' | 'characters' | 'timeline' | 'scenes';

/** Signet of a storyline (H1, N2 …) within its book. */
export function signetOf(book: Book, storylineId: string): string {
  return lineSignets(book.storylines, orderIndex(book.timePoints)).get(storylineId) ?? '';
}

/** „Anfang – Mitte“, or a single name when the range is one time point. */
export function rangeLabel(book: Book, s: { range: { startId: string; endId: string } }): string {
  const name = (id: string) => book.timePoints.find((t) => t.id === id)?.name ?? '?';
  return s.range.startId === s.range.endId ? name(s.range.startId) : `${name(s.range.startId)} – ${name(s.range.endId)}`;
}

/** Coloured signet chip in the line colour. */
export function SignetChip({ color, signet }: { color: string; signet: string }) {
  return (
    <span className="signet-badge" style={{ background: color, color: inkOn(color) }}>
      {signet}
    </span>
  );
}

/** Signet, title and „Hauptstrang · in Bearbeitung · Anfang – Ende“. */
export function StorylineHeader({ book, storyline }: { book: Book; storyline: Storyline }) {
  return (
    <div className="storyline-head" style={{ ['--line' as string]: storyline.color }}>
      <div>
        <p className="storyline-head-title">
          <SignetChip color={storyline.color} signet={signetOf(book, storyline.id)} />
          <span>{storyline.title}</span>
        </p>
        <p className="storyline-head-facts">
          {storyline.kind === 'main' ? 'Hauptstrang' : 'Nebenstrang'} · {STATUS_STYLE[storyline.status].label} · {rangeLabel(book, storyline)}
        </p>
      </div>
    </div>
  );
}

/**
 * Tab definitions for a storyline; side strands have no sections and so no „Zeitpunkte“ tab.
 * „Szenen“ counts the scenes of the storyline and its sections when `sceneCount` is given.
 */
export function storylineTabs(storyline: Storyline, sceneCount?: number): { id: StorylineTab; label: string; count?: number }[] {
  const tabs: { id: StorylineTab; label: string; count?: number }[] = [
    { id: 'details', label: 'Storyline' },
    { id: 'characters', label: 'Figuren', count: storyline.characterIds.length },
  ];
  if (storyline.kind === 'main') tabs.push({ id: 'timeline', label: 'Zeitpunkte', count: storyline.sections.length });
  tabs.push({ id: 'scenes', label: 'Szenen', ...(sceneCount !== undefined && { count: sceneCount }) });
  return tabs;
}

/** Segmented sub-tab bar; counts are decoration, the accessible name is the plain label. */
export function StorylineTabBar({ storyline, active, onChange, sceneCount }: { storyline: Storyline; active: StorylineTab; onChange: (tab: StorylineTab) => void; sceneCount?: number }) {
  return (
    <div className="storyline-tabs" role="tablist" aria-label="Bereiche der Storyline">
      {storylineTabs(storyline, sceneCount).map((t) => (
        <button key={t.id} type="button" role="tab" aria-label={t.label} aria-selected={t.id === active} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count !== undefined && <span className="tab-count" aria-hidden="true">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
