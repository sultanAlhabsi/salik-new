import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.SALIK_WEB_PORT ?? 5173),
    proxy: {
      '/api': process.env.SALIK_API_ORIGIN ?? 'http://localhost:3000'
    }
  },
  build: {
    outDir: 'dist/client',
    sourcemap: true
  }
});
