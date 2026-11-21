/** Tests for the timetable below the map and the storyline mode of the side panel. */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Book } from '@bookly/shared';
import { describe, expect, it } from 'vitest';
import { bookOk, meOk, sampleBook } from '../book/testFixtures';
import { renderApp } from '../test/render';
import { server } from '../test/setup';
import { packLanes, runsOf } from './Timetable';

/** Main strand over all three time points with two sections; Mira only in the first. */
function timetableBook(): Book {
  const book = sampleBook();
  const s = book.storylines[0]!;
  s.range = { startId: 't1', endId: 't3' };
  s.characterIds = ['c1', 'c2'];
  s.sections = [
    { id: 'x1', storylineId: 's1', title: 'Aufbruch', description: 'Mira legt ab.', characterIds: ['c1'], range: { startId: 't1', endId: 't2' }, note: null, order: 0 },
    { id: 'x2', storylineId: 's1', title: 'Heimkehr', description: '', characterIds: [], range: { startId: 't3', endId: 't3' }, note: null, order: 1 },
  ];
  return book;
}

async function select(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Storyline „${name}“` }));
}

describe('packLanes', () => {
  it('puts overlapping spans on separate lanes and reuses free ones', () => {
    const lanes = packLanes([{ id: 'a', span: [0, 1] as [number, number] }, { id: 'b', span: [1, 2] as [number, number] }, { id: 'c', span: [2, 3] as [number, number] }]);
    expect(lanes.map((l) => [l.id, l.lane])).toEqual([['a', 0], ['b', 1], ['c', 0]]);
  });
});

describe('runsOf', () => {
  it('joins neighbouring columns into runs', () => expect(runsOf(new Set([3, 0, 1]))).toEqual([[0, 1], [3, 3]]));
});

describe('Timetable', () => {
  it('shows a placeholder until a storyline is selected', async () => {
    server.use(meOk, bookOk(timetableBook()));
    renderApp('/books/b1');
    expect(await screen.findByText(/dann siehst du hier ihren Fahrplan/)).toBeInTheDocument();
  });

  it('lays out sections and characters of the selected storyline', async () => {
    server.use(meOk, bookOk(timetableBook()));
    renderApp('/books/b1');
    await select('Hauptstrang');
    const table = await screen.findByRole('region', { name: 'Fahrplan der Storyline' });
    expect(within(table).getByRole('button', { name: 'Abschnitt „Aufbruch“ öffnen' })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Abschnitt „Heimkehr“ öffnen' })).toBeInTheDocument();
    const people = within(table).getByRole('group', { name: 'Figuren im Verlauf' });
    expect(within(people).getByTitle('Mira in Abschnitten dabei')).toBeInTheDocument();
    expect(within(people).getByTitle('Jon in der Storyline, keinem Abschnitt zugeordnet')).toBeInTheDocument();
  });

  it('opens a section from the timetable in the „Zeitpunkte“ tab', async () => {
    server.use(meOk, bookOk(timetableBook()));
    renderApp('/books/b1');
    await select('Hauptstrang');
    await userEvent.click(await screen.findByRole('button', { name: 'Abschnitt „Heimkehr“ öffnen' }));
    expect(screen.getByRole('tab', { name: 'Zeitpunkte', selected: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Titel Heimkehr')).toHaveValue('Heimkehr');
  });

  it('opens the „Figuren“ tab from a character row', async () => {
    server.use(meOk, bookOk(timetableBook()));
    renderApp('/books/b1');
    await select('Hauptstrang');
    const people = await screen.findByRole('group', { name: 'Figuren im Verlauf' });
    await userEvent.click(within(people).getByRole('button', { name: 'Jon' }));
    expect(screen.getByRole('tab', { name: 'Figuren', selected: true })).toBeInTheDocument();
  });
});

describe('storyline mode of the side panel', () => {
  it('replaces the book tabs with a way back while a storyline is shown', async () => {
    server.use(meOk, bookOk(timetableBook()));
    renderApp('/books/b1');
    await userEvent.click(await screen.findByRole('tab', { name: 'Figuren' }));
    await select('Hauptstrang');
    expect(screen.getByRole('tab', { name: 'Storyline', selected: true })).toBeInTheDocument();
    expect(screen.getByText('Hauptstrang · in Bearbeitung · Anfang – Ende')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zurück zum Buch' }));
    expect(screen.getByRole('tab', { name: 'Figuren', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Zeitpunkte' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Fahrplan der Storyline' })).not.toBeInTheDocument();
  });
});
