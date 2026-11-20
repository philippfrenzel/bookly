/** Tests for the storyline map component. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Book } from '@bookly/shared';
import { sampleBook } from '../book/testFixtures';
import { FilterBar } from './FilterBar';
import { defaultFilterState, toMapFilter, useStoredFilters } from './filters';
import { StorylineMap } from './StorylineMap';

/** Book with a main strand, a side strand with a note and a connection between them. */
function connectedBook(): Book {
  const b = sampleBook();
  b.storylines.push({
    id: 's2', title: 'Nebenstrang', description: '', characterIds: ['c2'], range: { startId: 't2', endId: 't3' },
    kind: 'side', status: 'open', color: '#8A94A6', note: 'Ein langer Gedanke zum Nebenstrang', sections: [],
  });
  b.connections.push({ id: 'k1', fromId: 's1', toId: 's2', type: 'time_jump', label: null, characterId: null });
  return b;
}

/** Map plus filter bar wired together the way the book page does it. */
function Harness({ book }: { book: Book }) {
  const [state, setState] = useStoredFilters(book.id, book);
  return (
    <>
      <FilterBar book={book} state={state} onChange={setState} visibleCount={0} />
      <StorylineMap book={book} hints={[]} selectedId={null} onSelectStoryline={() => {}} filter={toMapFilter(state, book.timePoints)} showNotes={state.showNotes} />
    </>
  );
}

describe('StorylineMap', () => {
  it('prompts for time points on an empty book', () => {
    const book = { ...sampleBook(), timePoints: [], storylines: [] };
    render(<StorylineMap book={book} hints={[]} selectedId={null} onSelectStoryline={() => {}} />);
    expect(screen.getByText('Lege zuerst Zeitpunkte an.')).toBeInTheDocument();
  });

  it('prompts for a first storyline', () => {
    const book = { ...sampleBook(), storylines: [] };
    render(<StorylineMap book={book} hints={[]} selectedId={null} onSelectStoryline={() => {}} />);
    expect(screen.getByText('Noch keine Storylines. Lege die erste an.')).toBeInTheDocument();
  });

  it('shows time point names and the status symbol', () => {
    render(<StorylineMap book={sampleBook()} hints={[]} selectedId={null} onSelectStoryline={() => {}} />);
    expect(screen.getByText('Mitte')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Status: in Bearbeitung' })).toBeInTheDocument();
  });

  it('selects a storyline on click and Enter', async () => {
    const onSelect = vi.fn();
    render(<StorylineMap book={sampleBook()} hints={[]} selectedId={null} onSelectStoryline={onSelect} />);
    const bar = screen.getByRole('button', { name: 'Storyline „Hauptstrang“' });
    await userEvent.click(bar);
    bar.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenCalledWith('s1');
  });

  it('marks the selected bar and shows section titles on wide segments', () => {
    const book = sampleBook();
    book.storylines[0]!.sections = [
      { id: 'x1', storylineId: 's1', title: 'Aufbruch', description: '', characterIds: [], range: { startId: 't1', endId: 't1' }, note: null, order: 0 },
      { id: 'x2', storylineId: 's1', title: 'Sturm', description: '', characterIds: [], range: { startId: 't2', endId: 't2' }, note: null, order: 1 },
    ];
    render(<StorylineMap book={book} hints={[]} selectedId="s1" onSelectStoryline={() => {}} />);
    expect(screen.getByRole('button', { name: 'Storyline „Hauptstrang“' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Aufbruch')).toBeInTheDocument();
    expect(screen.getByText('Sturm')).toBeInTheDocument();
  });

  it('renders a dashed stub for a connection whose other end is hidden', () => {
    const filter = { mainOnly: true, openOnly: false, range: null, characterIds: [] };
    render(<StorylineMap book={connectedBook()} hints={[]} selectedId={null} onSelectStoryline={() => {}} filter={filter} />);
    expect(screen.queryByRole('button', { name: 'Storyline „Nebenstrang“' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Verbindung zu ausgeblendeter Storyline')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Verbindung „/ })).not.toBeInTheDocument();
  });

  it('draws the full connection when both ends are visible', () => {
    render(<StorylineMap book={connectedBook()} hints={[]} selectedId={null} onSelectStoryline={() => {}} filter={{ ...toMapFilter(defaultFilterState(), []) }} />);
    expect(screen.getByRole('button', { name: 'Verbindung „Hauptstrang“ → „Nebenstrang“' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Verbindung zu ausgeblendeter Storyline')).not.toBeInTheDocument();
  });

  it('hides notes by default and shows them after the toggle', async () => {
    render(<Harness book={connectedBook()} />);
    expect(screen.queryByText(/Ein langer Gedanke/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Notizen einblenden' }));
    expect(screen.getAllByText(/Ein langer Gedanke/).length).toBeGreaterThan(0);
  });

  it('filters through the filter bar and resets', async () => {
    render(<Harness book={connectedBook()} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Nur Hauptstränge' }));
    expect(screen.queryByRole('button', { name: 'Storyline „Nebenstrang“' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));
    expect(screen.getByRole('button', { name: 'Storyline „Nebenstrang“' })).toBeInTheDocument();
  });

  it('zooms with the buttons and resets the transform on fit', async () => {
    const { container } = render(<StorylineMap book={sampleBook()} hints={[]} selectedId={null} onSelectStoryline={() => {}} />);
    const layer = () => container.querySelector('g.zoom-layer')!.getAttribute('transform');
    expect(layer()).toBe('translate(0,0) scale(1)');
    await userEvent.click(screen.getByRole('button', { name: 'Vergrößern' }));
    expect(layer()).not.toBe('translate(0,0) scale(1)');
    await userEvent.click(screen.getByRole('button', { name: 'Alles einpassen' }));
    expect(layer()).toBe('translate(0,0) scale(1)');
  });

  it('grows the lane pitch when notes are shown', () => {
    const bandHeight = (showNotes: boolean) => {
      const { container, unmount } = render(<StorylineMap book={sampleBook()} hints={[]} selectedId={null} onSelectStoryline={() => {}} showNotes={showNotes} />);
      const h = Number(container.querySelector('rect.main-band')!.getAttribute('height'));
      unmount();
      return h;
    };
    expect(bandHeight(true)).toBeGreaterThanOrEqual(bandHeight(false) + 24);
  });

  it('keeps the note title reachable for hover', async () => {
    render(<Harness book={connectedBook()} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Notizen einblenden' }));
    const note = document.querySelector('.bar-note')!;
    expect(note.querySelector('title')?.textContent).toBe('Ein langer Gedanke zum Nebenstrang');
    expect(getComputedStyle(note).pointerEvents).not.toBe('none');
  });

  it('explains the zoom gestures as a tooltip on the zoom controls', () => {
    render(<StorylineMap book={sampleBook()} hints={[]} selectedId={null} onSelectStoryline={() => {}} />);
    const zoomIn = screen.getByRole('button', { name: 'Vergrößern' });
    expect(zoomIn.parentElement).toHaveAttribute('title', expect.stringContaining('Zoomen: Mausrad'));
  });
});
