import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/types/**'],
      thresholds: {
        statements: 60,
        branches: 55,
        functions: 55,
        lines: 62,
        'src/api/desktop.ts': { statements: 80, branches: 70, functions: 75, lines: 80 },
        'src/api/xmltvNormalizer.ts': { statements: 80, branches: 70, functions: 75, lines: 80 },
        'src/services/credentialVault.ts': { statements: 80, branches: 70, functions: 75, lines: 80 },
        'src/services/m3uParser.ts': { statements: 80, branches: 70, functions: 75, lines: 80 },
      },
    },
  },
});
