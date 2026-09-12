import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /* The API is proxied so the browser only ever talks to one origin,
       which keeps cookies and a future auth session straightforward. */
    proxy: {
      '/api': {
        target: process.env.CRM_API_URL || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
