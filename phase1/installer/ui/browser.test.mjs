import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'};
let server,browser,base;
before(async()=>{
 server=http.createServer((req,res)=>{const p=path.join(root,new URL(req.url,'http://localhost').pathname);try{res.setHeader('Content-Type',mime[path.extname(p)]||'text/plain');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/phase1/installer/ui/index.html`;
 browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
async function page(query='') {const p=await browser.newPage({viewport:{width:800,height:600},reducedMotion:'reduce'});await p.goto(base+query);await p.locator('.screen:not([hidden])').waitFor();return p;}
test('oversized window shows no white frame around the 800x600 page',async()=>{
 for(const scheme of ['light','dark']){
  const p=await browser.newPage({viewport:{width:836,height:640},colorScheme:scheme,reducedMotion:'reduce'});await p.goto(base);await p.locator('.screen:not([hidden])').waitFor();
  try{const c=await p.evaluate(()=>[document.documentElement,document.body,document.querySelector('.window')].map(e=>getComputedStyle(e).backgroundColor));
   assert.equal(c[0],c[2]);assert.equal(c[1],c[2]);assert.notEqual(c[0],'rgba(0, 0, 0, 0)');
   if(scheme==='dark')assert.notEqual(c[0],'rgb(255, 255, 255)');}finally{await p.close();}
 }
});
test('license requires real visible scroll and acceptance',async()=>{
 const p=await page();try{
 await p.locator('#btn-install').click();await p.locator('#s-license').waitFor({state:'visible'});
 assert.equal(await p.locator('#o-accept').isDisabled(),true);
 assert.equal(await p.locator('#scroll-hint').isVisible(),true);
 assert.equal(await p.locator('#lic-go').getAttribute('aria-disabled'),'true');
 await p.locator('#tab-privacy').click();assert.equal(await p.locator('#o-accept').isDisabled(),true);
 await p.locator('#tab-license').click();await p.locator('#panel-text').evaluate(el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'));});
 assert.equal(await p.locator('#o-accept').isDisabled(),false);
 await p.locator('#o-accept').check();assert.equal(await p.locator('#lic-go').getAttribute('aria-disabled'),'false');
 }finally{await p.close();}
});
test('cancel dialog traps focus and Escape returns to trigger',async()=>{
 const p=await page();try{await p.locator('#btn-close').click();assert.equal(await p.locator('#confirm').isVisible(),true);await p.keyboard.press('Shift+Tab');assert.equal(await p.locator('#cf-stop').evaluate(el=>el===document.activeElement),true);await p.keyboard.press('Escape');assert.equal(await p.locator('#confirm').isVisible(),false);assert.equal(await p.locator('#btn-close').evaluate(el=>el===document.activeElement),true);}finally{await p.close();}
});
test('occupied-folder failure offers another folder, never deletion',async()=>{
 const p=await page('?screen=error&mock=leftover&lang=de');try{await p.locator('#s-error').waitFor({state:'visible'});assert.equal(await p.locator('#err-retry').isVisible(),false);assert.match(await p.locator('#err-body').textContent(),/nichts gelöscht/);await p.locator('#err-secondary').click();assert.equal(await p.locator('#s-options').isVisible(),true);}finally{await p.close();}
});
test('all five locales have visible options within the fixed window',async()=>{
 for(const lang of ['en','de','es','fr','pt-BR']){const p=await page('?screen=options&lang='+lang);try{
 await p.locator('#s-options').waitFor({state:'visible'});
 for(const id of ['in-dir','o-signin','o-updates','opt-next']){const box=await p.locator('#'+id).boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=600,lang+':'+id);}
 const text=await p.locator('#s-options').textContent();assert.doesNotMatch(text,/options\.(?:signin|updates)/);
 }finally{await p.close();}}
});
test('finish is readable in dark mode and reduced motion',async()=>{
 const p=await page('?screen=finish');try{await p.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await p.locator('#s-finish').waitFor({state:'visible'});assert.equal(await p.locator('#btn-start').isVisible(),true);assert.equal(await p.locator('.ring .check').evaluate(el=>getComputedStyle(el).animationName),'none');}finally{await p.close();}
});
