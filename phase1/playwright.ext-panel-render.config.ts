import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'**/ext-panel-render.spec.ts',use:{viewport:{width:760,height:820}},reporter:'list'});
