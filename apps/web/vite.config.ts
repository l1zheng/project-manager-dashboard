import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PM_WEB_PORT ?? 5173),
    proxy: {
      '/api': {
        target: `http://${process.env.PM_HOST ?? '127.0.0.1'}:${process.env.PM_API_PORT ?? 4300}`,
        changeOrigin: true
      }
    }
  }
});
