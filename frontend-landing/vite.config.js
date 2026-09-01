import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Same shape as the other four frontends: plain React + Vite, deploys at
// its own domain/repo root, so base stays '/'. There's no <BrowserRouter>
// here at all (single static page, outbound links only), so nothing else
// has to move together with this value.
//
// Unlike the others, a dev port IS pinned: this site's whole job is linking
// to the tourist/business/agent apps, which each default to Vite's 5173 and
// increment from there — so the splitter deliberately sits out of that
// range rather than racing them for 5173. strictPort stays off so it can
// still fall forward if 5180 itself is taken.
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { port: 5180, host: true },
});
