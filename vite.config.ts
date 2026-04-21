import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  // Electron loads the packaged app via file:// — relative asset URLs are required
  // so the HTML and its CSS/JS resolve correctly from dist/index.html.
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
