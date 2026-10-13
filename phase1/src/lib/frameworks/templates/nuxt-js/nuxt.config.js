import somniaPreview from './somnia-preview.mjs';

// Server build: `nuxt build` writes .output/server/index.mjs, which runs with `node .output/server/index.mjs`.
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  telemetry: false,
  nitro: { preset: 'node-server' },
  vite: { plugins: [somniaPreview({ inlineScripts: true })] },
});
