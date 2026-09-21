import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { localApiPlugin } from './vite-plugin-local-api';

const useHttps = process.env.HTTPS === 'true' || process.argv.includes('--https');

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    localApiPlugin(),
    ...(useHttps ? [basicSsl()] : []),
  ],
  server: {
    port: 5173,
    host: true, // Listen on all local IPs so iPhone can access via local Wi-Fi in dev
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          turf: ['@turf/turf'],
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
});

