import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deploys at its own domain/repo root, separate from the other three
// frontends — script Section 12's Agent account gets its own portal.
// App.jsx's <BrowserRouter> has no basename, so this must stay '/' (or
// the two need to change together) — see frontend-business/vite.config.js's
// identical note; this repo learned that lesson the hard way once already.
export default defineConfig({
  plugins: [react()],
  base: '/',
});
