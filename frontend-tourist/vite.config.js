import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: '/atollisle/' matches the GitHub Pages deployment path from the
// script's chosen stack (atollisle.github.io/atollisle). Change this if
// your repo name differs.
export default defineConfig({
  plugins: [react()],
  base: '/',
});
