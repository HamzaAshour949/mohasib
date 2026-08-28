import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    // better-sqlite3 is a non-context-aware native addon: loading it inside a
    // worker thread fails with "Module did not self-register". Child processes
    // each get their own context, so the database-backed tests can run.
    pool: 'forks',
    include: ['{shared,electron,src,scripts}/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node'
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
      '@electron': resolve(__dirname, 'electron'),
      '@': resolve(__dirname, 'src')
    }
  }
});
