import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate deployment from the tourist and business apps — matches the
// script's "separate Super Admin web app" architecture (Section 10.1).
//
// Port is pinned (not left to float) — see frontend-tourist/vite.config.js's
// identical note for why. Admin isn't linked from frontend-landing (by
// design — see landing-splitter-brief.md), but it still gets a fixed port
// for the same reason the others do: predictable local dev, no surprises
// based on start order.
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 5176, strictPort: true },
});
