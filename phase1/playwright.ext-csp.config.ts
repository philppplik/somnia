import {defineConfig} from '@playwright/test';
// Standalone: no dev server, no app build. Everything is served by page.route.
export default defineConfig({testDir:'./tests',testMatch:'**/ext-csp-scheme.spec.ts',use:{viewport:{width:1280,height:800}},reporter:'list'});
