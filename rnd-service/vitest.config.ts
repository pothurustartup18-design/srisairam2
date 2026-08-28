import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // WhatsApp tests manipulate process.env and module-level caches;
    // run files sequentially to keep them isolated.
    fileParallelism: false
  }
});
