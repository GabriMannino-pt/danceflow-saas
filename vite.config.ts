import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    emptyOutDir: false,
    minify: false,
    cssMinify: false,
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('jspdf') || id.includes('@react-pdf')) return 'vendor-pdf';
            if (id.includes('recharts') || id.includes('framer-motion')) return 'vendor-ui';
            if (id.includes('@sentry')) return 'vendor-sentry';
            if (id.includes('date-fns') || id.includes('jszip')) return 'vendor-utils';
            if (id.includes('react')) return 'vendor-react';
            return 'vendor-libs';
          }
        },
      },
    },
  },
});
