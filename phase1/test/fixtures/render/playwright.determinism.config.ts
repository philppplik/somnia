import base from './playwright.config';
import {defineConfig} from '@playwright/test';
// Same browser, viewport, locale and server settings as the golden run; only the spec differs.
export default defineConfig({...base, updateSnapshots: 'none', testMatch: 'determinism.spec.ts',
  outputDir: '../../../test-results/render-determinism'});
