import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import somniaPreview from './somnia-preview.mjs';

// Server build: `vite build` writes build/index.js, which runs with `node build/index.js`.
export default defineConfig({
  plugins: [somniaPreview({ inlineScripts: true }), sveltekit({ adapter: adapter({ out: 'build' }) })],
});
