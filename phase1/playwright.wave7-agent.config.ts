import {defineConfig} from '@playwright/test';
// Sidebar/core validation without building absent native bridges. No engine test is claimed.
export default defineConfig({testDir:'./tests',testMatch:['wave7-agent.spec.ts','agent-panel.spec.ts'],workers:1,use:{baseURL:'http://127.0.0.1:1420',viewport:{width:1440,height:900}},webServer:{command:'npx vite --host 127.0.0.1',url:'http://127.0.0.1:1420',reuseExistingServer:false},reporter:'list'});
