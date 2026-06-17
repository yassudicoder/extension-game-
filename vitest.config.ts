import { defineConfig } from 'vitest/config'

// Wellbeing logic is pure and runtime-agnostic, so the unit tests run in plain Node.
// This config is intentionally separate from vite.config.ts so the @crxjs plugin
// (which expects an extension build context) is never loaded during testing.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
