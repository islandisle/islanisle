import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate deployment from the tourist and business apps — matches the
// script's "separate Super Admin web app" architecture (Section 10.1).
export default defineConfig({
  plugins: [react()],
  base: '/',
});
