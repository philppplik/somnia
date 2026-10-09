import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'slides-agent.spec.ts',workers:1,use:{baseURL:'http://127.0.0.1:1420',viewport:{width:1440,height:900},launchOptions:{executablePath:process.env.SOMNIA_CHROME||undefined}},webServer:{command:'npm run dev',url:'http://127.0.0.1:1420',reuseExistingServer:false},reporter:'list'});
