import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',use:{baseURL:'http://127.0.0.1:1420',viewport:{width:1440,height:900}},webServer:{command:'npx vite --port 1420 --host 127.0.0.1',url:'http://127.0.0.1:1420',reuseExistingServer:false},reporter:'list'});
