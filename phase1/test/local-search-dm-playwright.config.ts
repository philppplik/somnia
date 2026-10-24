import {defineConfig} from '@playwright/test';
/** Synthetic search only, one server; no native/Rust/WASM/full-desktop execution. */
export default defineConfig({testDir:'../tests',testMatch:['local-search-*.spec.ts','local-setup-df.spec.ts'],workers:2,fullyParallel:false,retries:0,timeout:30000,globalTimeout:360000,use:{baseURL:'http://127.0.0.1:1431',viewport:{width:1120,height:1000}},webServer:{command:'../node_modules/.bin/vite --config design-system/vite.config.ts',url:'http://127.0.0.1:1431',reuseExistingServer:false,timeout:30000},reporter:'list'});
