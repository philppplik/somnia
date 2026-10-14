import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
/** Real app harness: generated engine prerequisites are mandatory. CI-only locally. */
export default defineConfig({testDir:'.',testMatch:'capture.spec.ts',workers:1,retries:0,timeout:60000,updateSnapshots:'none',use:{baseURL:'http://127.0.0.1:1420',viewport:{width:1440,height:1000},deviceScaleFactor:1,locale:'en-GB',timezoneId:'Europe/Berlin',reducedMotion:'reduce'},webServer:{cwd:fileURLToPath(new URL('../../',import.meta.url)),command:'npm run dev',url:'http://127.0.0.1:1420',reuseExistingServer:false},reporter:'list'});
