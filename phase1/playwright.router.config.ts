import {defineConfig} from '@playwright/test';
/** Isolated production-component harness: no WASM build required to inspect the dialog. */
export default defineConfig({testDir:'./tests',testMatch:'router-dialog.spec.ts',use:{baseURL:'http://127.0.0.1:1420',viewport:{width:1200,height:800}},webServer:{command:'npx vite --host 127.0.0.1',url:'http://127.0.0.1:1420',reuseExistingServer:false},reporter:'list'});
