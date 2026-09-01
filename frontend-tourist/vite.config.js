import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deploys at the domain/repo root — App.jsx's <BrowserRouter> has no
// basename, so this must stay '/' (or the two need to change together).
// If this ever moves to a GitHub Pages project subpage instead, set both
// this and the BrowserRouter's basename to that subpath, e.g. '/atollisle/'.
//
// Port is pinned (not left to float) because frontend-landing links here
// assuming this exact port, regardless of which app gets started first —
// see frontend-landing/src/App.jsx and its .env.example. strictPort means
// Vite fails loudly if 5173 is somehow taken, instead of silently handing
// out a different port and quietly breaking those links.
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 5173, strictPort: true },
});
