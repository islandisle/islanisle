import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deploys at its own domain/repo root, separate from the tourist app —
// matches the script's "separate business portal" architecture.
// App.jsx's <BrowserRouter> has no basename, so this must stay '/' (or
// the two need to change together) — e.g. if this instead deploys to a
// subpath of the same repo, set both this and the basename to match it.
//
// Port is pinned (not left to float) — see frontend-tourist/vite.config.js's
// identical note for why. This one is 5174 specifically because
// frontend-landing's .env.example assumes it.
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 5174, strictPort: true },
});
