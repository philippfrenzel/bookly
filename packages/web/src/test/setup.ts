/** Test setup: jest-dom matchers, RTL cleanup, a shared msw server, and a fresh localStorage per test. */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

/** Shared msw server; tests add handlers with `server.use(...)`. */
export const server = setupServer();

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

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
// Every test starts with an empty localStorage, so stored map filters cannot leak from one test into the next.
beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.unstubAllGlobals();
});
afterAll(() => server.close());
