/** Vite configuration: React and Tailwind plugins plus a dev proxy to the API server. */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': process.env.API_TARGET ?? 'http://localhost:3000' } },
});
