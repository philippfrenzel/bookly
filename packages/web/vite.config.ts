/** Vite configuration: React plugin and a dev proxy to the API server. */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': process.env.API_TARGET ?? 'http://localhost:3000' } },
});
