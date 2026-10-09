// Regression probe for the existing panel policy. Uses synthetic data only.
// An observed request is a reproduced limitation, not a passed isolation test.
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {panelSrcdoc} from '../../src/lib/extensions/panelHtml.ts';
let leaks=0;
const server=createServer((req,res)=>{
  if(req.url.startsWith('/leak'))leaks++;
  res.end('<!doctype html><title>Panel sandbox probe</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH ?? '/usr/bin/google-chrome',args:['--no-sandbox']});
try {
  const page=await browser.newPage();await page.goto(origin);
  const srcdoc=panelSrcdoc(`<script>location.href='${origin}/leak?sample=private-test'</script>`);
  await page.evaluate(srcdoc=>{
    const frame=document.createElement('iframe');frame.sandbox='allow-scripts';
    frame.srcdoc=srcdoc;document.body.append(frame);
  },srcdoc);
  await page.waitForTimeout(500);
  assert.equal(leaks,1,'Existing panel self-navigation limitation was not reproduced');
  console.log(JSON.stringify({status:'limitation reproduced',iframeSelfNavigationRequests:leaks}));
} finally {await browser.close();server.close();}
