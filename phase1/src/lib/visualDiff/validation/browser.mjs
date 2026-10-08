import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server = spawn('npm', ['run','dev','--','--port','1420'], {stdio:'ignore', detached:true});
let browser;
try {
  for(let i=0;i<60;i++) {try {if((await fetch('http://127.0.0.1:1420/src/lib/visualDiff/validation/index.html')).ok) break;} catch {} await new Promise(r=>setTimeout(r,250));}
  browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const page = await browser.newPage({viewport:{width:1240,height:980}});
  const external=[];
  await page.route('**/*',route=>{if(!route.request().url().startsWith('http://127.0.0.1:1420/')){external.push(route.request().url()); return route.abort();}return route.continue();});
  await page.goto('http://127.0.0.1:1420/src/lib/visualDiff/validation/index.html');
  await page.getByRole('slider').waitFor();
  await page.waitForTimeout(500);
  assert.deepEqual(external,[]);
  assert.equal(await page.evaluate(()=>window.evil),undefined);
  assert.equal(await page.locator('iframe').first().getAttribute('sandbox'),'');
  const slider=page.getByRole('slider');await slider.focus();await page.keyboard.press('ArrowRight');assert.equal(await slider.inputValue(),'51');
  await page.screenshot({path:'/downloads/visual-diff-slider.png',fullPage:true});
  await page.getByRole('button',{name:'Side by side'}).click();
  assert.equal(await page.locator('iframe').count(),2);
  await page.screenshot({path:'/downloads/visual-diff-side-by-side.png',fullPage:true});
  await page.getByRole('button',{name:'Only changes'}).click();
  await page.getByRole('table',{name:'Changed source lines'}).waitFor();
  assert.equal(await page.locator('iframe').count(),0);
  await page.screenshot({path:'/downloads/visual-diff-changes.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{document.documentElement.style.cssText='--text-primary:#f0eff7;--bg-panel:#20212a;--bg-base:#30313a;--border-subtle:#858590;--accent:#b39aff';document.body.style.background='#181922';});
  await page.getByRole('button',{name:'Slider',exact:true}).click();
  await page.screenshot({path:'/downloads/visual-diff-small-dark.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(external,[]);
  console.log('Browser passed: zero remote requests/scripts; slider keyboard; modes; 390px dark layout.');
} finally {await browser?.close();try {process.kill(-server.pid,'SIGTERM');}catch{}}
