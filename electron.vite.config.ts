import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
        '@electron': resolve(__dirname, 'electron')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared')
      }
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html')
      }
    }
  }
});
