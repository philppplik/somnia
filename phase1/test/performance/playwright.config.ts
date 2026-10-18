import {defineConfig} from '@playwright/test';
import {requireArtifacts} from '../../scripts/performance/studios/preflight.mjs';
requireArtifacts();
export default defineConfig({testDir:'.',testMatch:'retention.spec.ts',workers:1,retries:0,timeout:60_000,
 use:{baseURL:'http://127.0.0.1:1443',viewport:{width:1440,height:900},locale:'en-US'},
 webServer:{command:'npx vite --host 127.0.0.1 --port 1443 --strictPort',url:'http://127.0.0.1:1443',reuseExistingServer:false},
 reporter:[['list'],['json',{outputFile:'test-results/retention/report.json'}]]});
