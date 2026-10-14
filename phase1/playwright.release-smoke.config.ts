import {defineConfig} from '@playwright/test';
/** Shell logic only. No fake WASM bridges and no native platform claims. */
export default defineConfig({
 testDir:'./tests',testMatch:'release-smoke.spec.ts',fullyParallel:false,workers:1,retries:0,
 forbidOnly:!!process.env.CI,timeout:30_000,expect:{timeout:10_000},
 use:{baseURL:'http://127.0.0.1:1420',viewport:{width:1440,height:900},
  trace:'retain-on-failure',screenshot:'only-on-failure',
  launchOptions:process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH,args:['--no-sandbox']}:{}},
 webServer:{command:'npx vite --host 127.0.0.1',url:'http://127.0.0.1:1420',reuseExistingServer:false},
 reporter:[['list'],['json',{outputFile:'test-results/release-smoke.json'}]],
});
