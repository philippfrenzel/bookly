/** Tests for the storyline map component. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleBook } from '../book/testFixtures';
import { StorylineMap } from './StorylineMap';

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
    expect(screen.getByText('✎')).toBeInTheDocument();
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
});
