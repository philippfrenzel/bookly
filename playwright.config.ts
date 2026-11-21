/** Playwright configuration: starts an isolated API (own database) and a web dev server; ports come from E2E_API_PORT (3100) and E2E_WEB_PORT (5174). */
import { defineConfig } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT ?? '3100';
const webPort = process.env.E2E_WEB_PORT ?? '5174';
const e2eDb = process.env.E2E_DATABASE_URL ?? 'postgres://localhost:5432/bookly_e2e';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: `http://localhost:${webPort}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'npm -w packages/server run start',
      // Unauthenticated, so it answers 401: enough to prove the server is up.
      url: `http://localhost:${apiPort}/api/auth/me`,
      env: { DATABASE_URL: e2eDb, PORT: apiPort, AI_FAKE: '1' },
      reuseExistingServer: false,
    },
    {
      command: `npm -w packages/web run dev -- --port ${webPort} --strictPort`,
      url: `http://localhost:${webPort}`,
      env: { API_TARGET: `http://localhost:${apiPort}` },
      reuseExistingServer: false,
    },
  ],
});
