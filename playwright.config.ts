/** Playwright configuration: starts an isolated API (port 3100, own database) and a web dev server (5174). */
import { defineConfig } from '@playwright/test';

const e2eDb = process.env.E2E_DATABASE_URL ?? 'postgres://localhost:5432/bookly_e2e';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5174', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'npm -w packages/server run start',
      // Unauthenticated, so it answers 401: enough to prove the server is up.
      url: 'http://localhost:3100/api/auth/me',
      env: { DATABASE_URL: e2eDb, PORT: '3100', AI_FAKE: '1' },
      reuseExistingServer: false,
    },
    {
      command: 'npm -w packages/web run dev -- --port 5174 --strictPort',
      url: 'http://localhost:5174',
      env: { API_TARGET: 'http://localhost:3100' },
      reuseExistingServer: false,
    },
  ],
});
