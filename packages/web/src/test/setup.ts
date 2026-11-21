/** Test setup: jest-dom matchers, RTL cleanup, a shared msw server, a fresh localStorage per test, and layout stubs for CodeMirror. */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

/** Shared msw server; tests add handlers with `server.use(...)`. By default nobody shares a book for review. */
export const server = setupServer(http.get('/api/reviews', () => HttpResponse.json([])));

/** In-memory Storage; Node 26 exposes a broken global localStorage that shadows jsdom's. */
export function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

// Component tests type into a textarea stand-in; ProseField's own tests use vi.importActual / vi.unmock.
vi.mock('../editor/ProseField', async (importActual) => {
  const actual = await importActual<typeof import('../editor/ProseField')>();
  const { ProseFieldStub } = await import('./ProseFieldStub');
  return { ...actual, ProseField: ProseFieldStub };
});

// jsdom has no layout: give Range the rect methods CodeMirror measures with (ProseField).
const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
if (!Range.prototype.getClientRects) Range.prototype.getClientRects = emptyRects;
if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => new DOMRect();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
// Every test starts with an empty localStorage, so stored map filters cannot leak from one test into the next.
beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.unstubAllGlobals();
});
afterAll(() => server.close());
