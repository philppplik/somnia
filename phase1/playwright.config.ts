import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testIgnore:'**/raster-production.spec.ts',retries:process.env.CI?1:0,use:{baseURL:'http://127.0.0.1:1420',viewport:{width:1440,height:900}},webServer:{command:'npm run dev',url:'http://127.0.0.1:1420',reuseExistingServer:false},reporter:'list'});
