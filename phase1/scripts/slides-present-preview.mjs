import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1432'],{stdio:['ignore','pipe','pipe']});
server.stderr.on('data',d=>process.stderr.write(d));let browser;
try{
 for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:1432/test/slides/present-preview.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:1432/test/slides/present-preview.html');
 const trigger=page.getByRole('button',{name:'Present',exact:true});await trigger.waitFor();await page.waitForFunction(()=>!document.querySelector('[data-testid=hero-action-main]').disabled);
 const slide=n=>page.getByTestId('slides-present').getByRole('img',{name:`Slide ${n}`,exact:true});
 await page.getByRole('button',{name:'Select slide 2'}).click();await page.getByRole('img',{name:'Editor preview'}).waitFor();await page.waitForFunction(()=>document.body.textContent.includes('Slide 2 of 3'));
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
  await page.screenshot({path:`/downloads/slides-present-editor-${theme}.png`});
  await trigger.click();await slide(2).waitFor();await page.mouse.move(600,500);
  await page.screenshot({path:`/downloads/slides-present-${theme}.png`});
  assert.equal(await page.evaluate(()=>!!document.fullscreenElement),true);
  await page.keyboard.press('ArrowRight');await slide(3).waitFor();await page.keyboard.press('Home');await slide(1).waitFor();
  await page.keyboard.press('End');await slide(3).waitFor();await page.keyboard.press('PageUp');await slide(2).waitFor();
  await page.keyboard.press('b');assert.equal(await page.getByTestId('slides-present').getByRole('img').count(),0);await page.keyboard.press('b');await slide(2).waitFor();
  await page.keyboard.press('1');await page.keyboard.press('Enter');await slide(1).waitFor();await page.keyboard.press('Space');await slide(2).waitFor();
  await page.getByTestId('slides-present').click({position:{x:20,y:200}});await slide(1).waitFor();
  await page.mouse.move(600,500);await page.waitForTimeout(2400);assert.equal(await page.getByRole('navigation',{name:'Presentation controls'}).evaluate(el=>getComputedStyle(el).opacity),'0');
  await page.keyboard.press('Tab');assert.equal(await page.getByRole('navigation',{name:'Presentation controls'}).evaluate(el=>getComputedStyle(el).opacity),'1');
  await page.keyboard.press('Escape');await page.getByTestId('slides-present').waitFor({state:'detached'});
  await page.waitForFunction(()=>document.activeElement===document.querySelector('[data-testid=hero-action-main]'));
  await page.waitForFunction(()=>!document.querySelector('[data-testid=hero-action-main]').disabled);
  await page.keyboard.press('Tab');await page.getByRole('button',{name:'Select slide 2'}).click();await page.waitForFunction(()=>document.body.textContent.includes('Slide 2 of 3'));
 }
 await page.keyboard.press('F5');await slide(2).waitFor();await page.keyboard.press('Escape');await page.getByTestId('slides-present').waitFor({state:'detached'});await page.waitForFunction(()=>!document.querySelector('[data-testid=hero-action-main]').disabled);
 await page.keyboard.press('Shift+F5');await slide(1).waitFor();
 // OS/browser fullscreen exit should also leave present mode.
 await page.evaluate(()=>document.exitFullscreen());await page.getByTestId('slides-present').waitFor({state:'detached'});await page.waitForFunction(()=>!document.querySelector('[data-testid=hero-action-main]').disabled);
 // Fullscreen denial must leave an operable full-window presentation.
 await page.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.reject(new Error('test denied'));});
 await trigger.click();await slide(1).waitFor();assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false);await page.keyboard.press('Escape');await page.getByTestId('slides-present').waitFor({state:'detached'});
 const rendered=await page.evaluate(()=>window.presentTest.renders);assert.ok(rendered.some(r=>r.scale>1.5));assert.ok(rendered.some(r=>r.index===2&&r.scale>1.5));assert.deepEqual(errors,[]);
 console.log('PASS: current/start commands, F5/Shift+F5, navigation, numeric jump, black screen, edge click, auto-hide, focus trap/restore, fullscreen entry/exit/denial fallback, reduced-motion and screen-size prerender. Renderer double only.');
}finally{await browser?.close();server.kill('SIGTERM');}
