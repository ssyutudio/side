import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['**/*.test.ts', 'apps/desktop/src/main/connectors/**/*.test.mjs'],
    exclude: ['**/node_modules/**', '**/dist/**', '.war-room-state/**'],
    environment: 'node',
  },
});
