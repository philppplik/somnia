import {fileURLToPath} from 'node:url';
import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'*.spec.ts',outputDir:'../../test-results/ds-p1',workers:1,retries:0,use:{baseURL:'http://127.0.0.1:1431/test/design-system/',viewport:{width:1280,height:1000}},webServer:{cwd:fileURLToPath(new URL('../../',import.meta.url)),command:'npx vite --config test/design-system/vite.config.ts',url:'http://127.0.0.1:1431/test/design-system/',reuseExistingServer:false},reporter:'list'});
