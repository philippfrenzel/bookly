/** Test fixtures: a small book and msw handlers for the book page. */
import { http, HttpResponse } from 'msw';
import type { Book } from '@bookly/shared';

/** Signed-in user handler. */
export const meOk = http.get('/api/auth/me', () =>
  HttpResponse.json({ user: { id: 'u1', email: 'a@b.de', displayName: 'Anna' } }),
);

/** Book with three time points, one main storyline spanning Anfang..Mitte and two characters. */
export function sampleBook(): Book {
  return {
    id: 'b1',
    title: 'Sturmland',
    timePoints: [
      { id: 't1', name: 'Anfang', position: 0 },
      { id: 't2', name: 'Mitte', position: 1 },
      { id: 't3', name: 'Ende', position: 2 },
    ],
    characters: [
      { id: 'c1', name: 'Mira', description: 'Kapitänin' },
      { id: 'c2', name: 'Jon', description: null },
    ],
    storylines: [
      {
        id: 's1', title: 'Hauptstrang', description: '', characterIds: ['c1'],
        range: { startId: 't1', endId: 't2' }, kind: 'main', status: 'in_progress',
        color: '#2B59C3', note: null, sections: [],
      },
    ],
    connections: [],
    acknowledgements: [],
  };
}

/** GET handler serving the given book. */
export const bookOk = (book: Book) => http.get('/api/books/b1', () => HttpResponse.json({ book, hints: [] }));
