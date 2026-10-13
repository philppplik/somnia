import {defineConfig} from '@playwright/test';
process.env.SOMNIA_GIT_HARNESS='1';
export default defineConfig({testDir:'./tests',testMatch:'git-invalidation-harness.spec.ts',use:{baseURL:'http://127.0.0.1:1420',viewport:{width:1440,height:1000},launchOptions:{executablePath:process.env.SOMNIA_CHROME||undefined,args:['--no-sandbox']}},webServer:{command:'npx vite --host 127.0.0.1',url:'http://127.0.0.1:1420',reuseExistingServer:false},reporter:'list'});
