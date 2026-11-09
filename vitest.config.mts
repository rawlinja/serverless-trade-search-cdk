import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  // Mirrors the tsconfig.json paths; tsx and esbuild read those directly, Vitest does not.
  resolve: {
    alias: {
      '@stacks': fromRoot('./src/Infrastructure/stacks'),
      '@config': fromRoot('./src/Infrastructure/config'),
      '@lib': fromRoot('./src/lib'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        // Synthesizing a stack takes a few seconds.
        test: { name: 'stacks', include: ['src/tests/stacks/**/*.test.ts'], testTimeout: 120_000 },
      },
    ],
  },
})
