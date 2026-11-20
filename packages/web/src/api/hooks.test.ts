/** Tests for the polling rule of useBook and the cache handling of book mutations. */
import { createElement, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { BookResponse, CharacterCheck } from '@bookly/shared';
import { bookResponse, sampleBook } from '../book/testFixtures';
import { server } from '../test/setup';
import { checksRefetchInterval, useBookMutation } from './hooks';
import { createQueryClient } from './queryClient';

const check = (status: CharacterCheck['status']) => ({ status }) as CharacterCheck;
const data = (...statuses: CharacterCheck['status'][]) => ({
  state: { data: { characterChecks: statuses.map(check), ai: { enabled: true } } },
});

describe('checksRefetchInterval', () => {
  it('polls every 2 s while a check is pending', () => expect(checksRefetchInterval(data('done', 'pending'))).toBe(2000));
  it('polls every 2 s while a check is running', () => expect(checksRefetchInterval(data('running'))).toBe(2000));
  it('stops when all checks are settled', () => expect(checksRefetchInterval(data('done', 'failed'))).toBe(false));
  it('does not poll without data', () => expect(checksRefetchInterval({ state: { data: undefined } })).toBe(false));
  it('does not poll leftover checks while the AI is off', () =>
    expect(checksRefetchInterval({ state: { data: { characterChecks: [check('running')], ai: { enabled: false } } } })).toBe(false));
});

describe('useBookMutation', () => {
  it('a book fetch still in flight does not overwrite the mutation result', async () => {
    const stale = bookResponse({ ...sampleBook(), title: 'Alt' });
    const fresh = bookResponse({ ...sampleBook(), title: 'Neu' });
    let releaseGet!: () => void;
    const getHeld = new Promise<void>((r) => { releaseGet = r; });
    server.use(
      http.get('/api/books/b1', async () => {
        await getHeld;
        return HttpResponse.json(stale);
      }),
      http.patch('/api/books/b1/title', () => HttpResponse.json(fresh)),
    );
    const qc = createQueryClient(false);
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => useBookMutation<void>('b1', 'PATCH', () => '/api/books/b1/title'), { wrapper });
    const fetching = qc.fetchQuery({ queryKey: ['book', 'b1'], queryFn: () => fetch('/api/books/b1').then((r) => r.json()) }).catch(() => undefined);
    await act(() => result.current.mutateAsync());
    releaseGet();
    await fetching;
    await waitFor(() => expect(qc.getQueryData<BookResponse>(['book', 'b1'])?.book.title).toBe('Neu'));
    await new Promise((r) => setTimeout(r, 20));
    expect(qc.getQueryData<BookResponse>(['book', 'b1'])?.book.title).toBe('Neu');
  });
});
