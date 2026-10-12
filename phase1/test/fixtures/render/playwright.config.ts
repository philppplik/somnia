import {defineConfig} from '@playwright/test';
import {updateScope} from './approval';
const updating = process.argv.some(a => /^--update-snapshots(?:=|$)/.test(a) || a === '-u');
// Even direct Playwright update invocations must present an approval receipt.
if (updating) updateScope();
export default defineConfig({
  updateSnapshots: updating ? 'all' : 'none',
  testDir: '.', testMatch: ['render.spec.ts', 'overlay-oracle.spec.ts'], workers: 4, retries: 0, timeout: 30000,
  snapshotPathTemplate: '{testDir}/goldens/{arg}{ext}',
  outputDir: '../../../test-results/render', reporter: 'list',
  use: {browserName: 'chromium', baseURL: 'http://127.0.0.1:1420',
    viewport: {width: 1000, height: 700}, deviceScaleFactor: 1,
    locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', reducedMotion: 'reduce'},
  expect: {toHaveScreenshot: {animations: 'disabled', caret: 'hide', scale: 'css', threshold: 0.1, maxDiffPixels: 16}},
  // Deliberately skip npm run dev's unrelated WASM prerequisite check.
  webServer: {command: 'npx vite --host 127.0.0.1', cwd: '../../..', url: 'http://127.0.0.1:1420', reuseExistingServer: false},
});
