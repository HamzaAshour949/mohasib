import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Production Content-Security-Policy for the renderer.
 *
 * Injected into the built HTML only: the dev server's HMR client needs the
 * inline preamble that `script-src 'self'` forbids, so a policy baked into
 * `src/index.html` would either break `npm run dev` or have to be loosened
 * until it protected nothing.
 *
 * `style-src 'unsafe-inline'` is required by the print helper, which renders a
 * document with an inline <style> into a hidden iframe.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'"
].join('; ');

const injectCsp = (): Plugin => ({
  name: 'mohasib:inject-csp',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html: string): string {
      // The charset declaration must stay first in the document, so the policy
      // goes immediately after it rather than at the top of <head>.
      const charset = '<meta charset="UTF-8" />';
      if (!html.includes(charset)) throw new Error('index.html: charset meta not found, cannot place CSP');
      return html.replace(charset, `${charset}\n  <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    }
  }
});

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
    // No externalizeDepsPlugin here on purpose: a sandboxed preload cannot
    // `require` anything but Electron's own module, so every import — including
    // the shared IPC channel list — has to be inlined into one CommonJS file.
    // Building main and preload as separate bundles keeps the shared module
    // inlined into each rather than hoisted into a chunk they both import.
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') },
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          inlineDynamicImports: true
        }
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
    base: './',
    plugins: [react(), injectCsp()],
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
