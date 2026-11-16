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
    env: { POWERTOOLS_LOG_LEVEL: 'SILENT' },
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/tests/{lib,web,scripts}/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['src/tests/integration/**/*.test.ts'],
          globalSetup: ['src/tests/integration/global-setup.ts'],
          fileParallelism: false,
        },
      },
      {
        extends: true,
        // Synthesizing a stack takes a few seconds.
        test: { name: 'stacks', include: ['src/tests/stacks/**/*.test.ts'], testTimeout: 120_000 },
      },
    ],
  },
})
