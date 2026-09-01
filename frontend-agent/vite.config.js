import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deploys at its own domain/repo root, separate from the other three
// frontends — script Section 12's Agent account gets its own portal.
// App.jsx's <BrowserRouter> has no basename, so this must stay '/' (or
// the two need to change together) — see frontend-business/vite.config.js's
// identical note; this repo learned that lesson the hard way once already.
//
// Port is pinned (not left to float) — see frontend-tourist/vite.config.js's
// identical note for why. This one is 5175 specifically because
// frontend-landing's .env.example assumes it.
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 5175, strictPort: true },
});
