/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Only reached via dynamic import, so pre-bundle it at startup instead of mid-session.
  optimizeDeps: { include: ['@mediapipe/tasks-vision'] },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  },
});
