import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:'vector-studio-interchange.spec.ts',retries:0,
  use:{baseURL:'http://127.0.0.1:1420',viewport:{width:960,height:400}},
  webServer:{command:'npx vite --config tests/vector-interchange.vite.config.ts --host 127.0.0.1',url:'http://127.0.0.1:1420/tests/assets/vector-studio/harness.html',reuseExistingServer:false},
  reporter:'list',
});
