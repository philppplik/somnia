import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'raster-production.spec.ts',use:{baseURL:'http://127.0.0.1:1431',viewport:{width:1440,height:900}},webServer:{command:'npm run preview -- --host 127.0.0.1 --port 1431',url:'http://127.0.0.1:1431',reuseExistingServer:false},reporter:'list'});
