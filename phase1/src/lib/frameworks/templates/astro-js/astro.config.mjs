import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import somniaPreview from './somnia-preview.mjs';

// Server build: `astro build` writes dist/server/entry.mjs, which runs with `node dist/server/entry.mjs`.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  vite: { plugins: [somniaPreview({ inlineScripts: true })] },
});
