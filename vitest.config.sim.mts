import { defineConfig } from 'vitest/config';

// The simulator is a pure-TypeScript package outside the Angular src/ tree, so it
// needs neither the Angular Vite plugin nor jsdom. A separate config keeps its
// tests fast and independent of the app's. Run with: npm run test:sim
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['sim/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      reportsDirectory: 'coverage/sim',
      include: ['sim/src/**/*.ts'],
      exclude: ['sim/**/*.spec.ts'],
    },
  },
});
