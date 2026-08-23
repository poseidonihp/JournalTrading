import { defineConfig } from 'vitest/config';

/**
 * Runner mínimo para la parte estadística de Mentor Mode. Los tests viven junto
 * al código como `*.spec.ts` y no tocan base de datos.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
