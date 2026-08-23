import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate GitHub Pages deployment from the tourist app — matches the
// script's "separate business portal" architecture. Adjust base path to
// match wherever this actually deploys (e.g. a separate repo, or a
// subpath of the same one).
export default defineConfig({
  plugins: [react()],
  base: '/',
});
