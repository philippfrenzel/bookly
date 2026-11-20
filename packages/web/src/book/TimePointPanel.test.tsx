/** Tests for the time point panel: insert, rename, reorder pre-validation, delete usages. */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';
import { server } from '../test/setup';
import { bookOk, meOk, sampleBook } from './testFixtures';

async function openPanel() {
  renderApp('/books/b1');
  await userEvent.click(await screen.findByRole('tab', { name: 'Zeitpunkte' }));
}

describe('TimePointPanel', () => {
  it('lists time points in order', async () => {
    server.use(meOk, bookOk(sampleBook()));
    await openPanel();
    const inputs = screen.getAllByLabelText(/^Name Zeitpunkt/) as HTMLInputElement[];
    expect(inputs.map((i) => i.value)).toEqual(['Anfang', 'Mitte', 'Ende']);
  });

  it('inserts first with afterId null and after a row with its id', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.post('/api/books/b1/timepoints', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ book: sampleBook(), hints: [] }, { status: 201 });
      }),
    );
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: '+ Zeitpunkt' }));
    await userEvent.click(screen.getByRole('button', { name: 'Zeitpunkt „Mitte“ danach einfügen' }));
    expect(bodies).toEqual([
      { name: 'Neuer Zeitpunkt', afterId: null },
      { name: 'Neuer Zeitpunkt', afterId: 't2' },
    ]);
  });

  it('renames inline on blur', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.patch('/api/books/b1/timepoints/t3', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ book: sampleBook(), hints: [] });
      }),
    );
    await openPanel();
    const input = screen.getByLabelText('Name Zeitpunkt Ende');
    await userEvent.clear(input);
    await userEvent.type(input, 'Finale');
    await userEvent.tab();
    expect(bodies).toEqual([{ name: 'Finale' }]);
  });

  it('shows IssueList for an inverting reorder and does not call the API', async () => {
    let putCalls = 0;
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.put('/api/books/b1/timepoints/order', () => {
        putCalls += 1;
        return HttpResponse.json({});
      }),
    );
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Zeitpunkt „Mitte“ nach oben' }));
    const alert = await screen.findByRole('alert');
    expect(screen.getByText('Das geht so nicht:')).toBeInTheDocument();
    expect(alert).toHaveTextContent('Storyline „Hauptstrang“');
    expect(putCalls).toBe(0);
  });

  it('sends a valid reorder', async () => {
    const bodies: unknown[] = [];
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.put('/api/books/b1/timepoints/order', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ book: sampleBook(), hints: [] });
      }),
    );
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Zeitpunkt „Ende“ nach oben' }));
    expect(await screen.findByLabelText('Name Zeitpunkt Ende')).toBeInTheDocument();
    expect(bodies).toEqual([{ ids: ['t1', 't3', 't2'] }]);
  });

  it('shows usages locally for a used time point without calling the API', async () => {
    let deletes = 0;
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.delete('/api/books/b1/timepoints/t2', () => {
        deletes += 1;
        return HttpResponse.json({});
      }),
    );
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Zeitpunkt „Mitte“ löschen' }));
    expect(await screen.findByText('Dieser Zeitpunkt wird noch verwendet:')).toBeInTheDocument();
    expect(screen.getByText('Storyline „Hauptstrang“')).toBeInTheDocument();
    expect(deletes).toBe(0);
  });

  it('renders usages from a 409 (race with another editor)', async () => {
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.delete('/api/books/b1/timepoints/t3', () =>
        HttpResponse.json(
          { error: 'time_point_in_use', usages: [{ kind: 'section', id: 'x', title: 'Sturm' }] },
          { status: 409 },
        ),
      ),
    );
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Zeitpunkt „Ende“ löschen' }));
    expect(await screen.findByText('Abschnitt „Sturm“')).toBeInTheDocument();
  });

  it('deletes an unused time point', async () => {
    const after = sampleBook();
    after.timePoints = after.timePoints.slice(0, 2);
    server.use(
      meOk,
      bookOk(sampleBook()),
      http.delete('/api/books/b1/timepoints/t3', () => HttpResponse.json({ book: after, hints: [] })),
    );
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Zeitpunkt „Ende“ löschen' }));
    await screen.findByLabelText('Name Zeitpunkt Mitte');
    expect(screen.queryByLabelText('Name Zeitpunkt Ende')).not.toBeInTheDocument();
  });
});
