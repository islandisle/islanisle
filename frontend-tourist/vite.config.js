import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deploys at the domain/repo root — App.jsx's <BrowserRouter> has no
// basename, so this must stay '/' (or the two need to change together).
// If this ever moves to a GitHub Pages project subpage instead, set both
// this and the BrowserRouter's basename to that subpath, e.g. '/atollisle/'.
export default defineConfig({
  plugins: [react()],
  base: '/',
});
