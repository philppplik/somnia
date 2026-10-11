import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'commit-review.spec.ts',use:{baseURL:'http://127.0.0.1:1420',viewport:{width:1440,height:1000},launchOptions:{executablePath:process.env.SOMNIA_CHROME||undefined,args:['--no-sandbox']}},webServer:{command:'npm run dev',url:'http://127.0.0.1:1420',reuseExistingServer:false},reporter:'list'});
