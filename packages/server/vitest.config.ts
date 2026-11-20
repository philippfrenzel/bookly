/** Vitest config: tests share one database, so files run sequentially. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { fileParallelism: false, testTimeout: 20000 },
});
