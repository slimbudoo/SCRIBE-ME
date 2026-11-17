import { defineConfig } from 'vite';

export default defineConfig({
  // Relative URLs work on GitHub Pages project paths and local previews.
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: 'dist' },
});
