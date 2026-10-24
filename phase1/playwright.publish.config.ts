import {defineConfig} from '@playwright/test';
/** Publish panel e2e against a mocked Tauri IPC (no server, no network). Uses the system Chrome when PW_CHROME is set. */
export default defineConfig({testDir:'./tests',testMatch:'publish-panel.spec.ts',use:{baseURL:'http://127.0.0.1:1420',viewport:{width:1440,height:900},launchOptions:process.env.PW_CHROME?{executablePath:process.env.PW_CHROME}:{}},webServer:{command:'npx vite --port 1420 --host 127.0.0.1',url:'http://127.0.0.1:1420',reuseExistingServer:true},reporter:'list'});
