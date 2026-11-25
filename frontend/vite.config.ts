import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = { '/api': 'http://127.0.0.1:5010' };
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 3010, strictPort: true, proxy },
  build: { rollupOptions: { output: { manualChunks(id) {
    if (id.includes('/node_modules/monaco-editor/')) return 'monaco';
  } } } },
  preview: { host: '127.0.0.1', port: 3010, strictPort: true, proxy },
});
