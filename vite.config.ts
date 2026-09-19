import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localApiPlugin } from './vite-plugin-local-api';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), localApiPlugin()],
  server: {
    port: 5173,
    host: true, // Listen on all local IPs so iPhone can access via local Wi-Fi in dev
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

