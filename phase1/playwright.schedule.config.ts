import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'vibespace-schedule.spec.ts',use:{baseURL:'http://127.0.0.1:1420',viewport:{width:1000,height:1000}},webServer:{command:'npx vite --host 127.0.0.1',url:'http://127.0.0.1:1420',reuseExistingServer:false},reporter:'list'});
