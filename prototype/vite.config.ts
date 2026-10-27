import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Protótipo isolado: sem Firebase, sem chamadas de rede para dados.
export default defineConfig({
  plugins: [react()],
  base: './',
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
