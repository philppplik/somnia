/** Local integration gate. Never uses a real user's project or remote server. */
import {spawn,spawnSync} from 'node:child_process';import {cpSync,mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {createServer} from 'node:net';import {chromium} from '@playwright/test';
const root=resolve(import.meta.dirname,'..'),dir=mkdtempSync(join(tmpdir(),'somnia-preview-'));
const freePort=()=>new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
let proc,browser;
try{
 cpSync(join(root,'src/lib/frameworks/templates/react-ts'),dir,{recursive:true});
 const install=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['ci','--ignore-scripts'],{cwd:dir,encoding:'utf8',timeout:300000,shell:false});if(install.status)throw Error('Template install failed');
 const port=await freePort(),token='a'.repeat(64),origin=`http://127.0.0.1:${port}`;
 proc=spawn(process.execPath,[join(dir,'node_modules/vite/bin/vite.js')],{cwd:dir,env:{...process.env,SOMNIA_PREVIEW_TOKEN:token,SOMNIA_PREVIEW_PORT:String(port)},stdio:'pipe'});
 let ready=false;for(let i=0;i<100;i++){try{await fetch(origin);ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}if(!ready)throw Error('Dev server did not start');
 if((await fetch(origin)).status!==403)throw Error('Unauthenticated preview request allowed');
 if((await fetch(origin+'/__somnia/source-events')).status!==403)throw Error('Unauthenticated source GET allowed');
 if((await fetch(origin+'/__somnia/source-events',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:'{}'})).status!==403)throw Error('Unauthenticated source POST allowed');
 browser=await chromium.launch();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/?somnia-preview-token='+token);await page.getByRole('button',{name:'Clicked 0 times'}).click();await page.getByRole('button',{name:'Clicked 1 times'}).waitFor();
 const csp=(await page.request.get(origin)).headers()['content-security-policy'];if(!csp.includes("script-src 'self';")||!csp.includes("frame-ancestors 'none'")||csp.includes('*'))throw Error('CSP widened');
 await page.locator('h1').click({modifiers:['Alt']});let events=[];for(let i=0;i<20;i++){const result=await fetch(origin+'/__somnia/source-events',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());events.push(...result.events);if(events.length)break;await new Promise(r=>setTimeout(r,100));}
 if(events[0]?.file!=='src/App.tsx'||events[0]?.col!==1)throw Error('Click-to-source did not arrive');
 const again=await fetch(origin+'/__somnia/source-events',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());if(again.events.length)throw Error('Queue not drained');
 const invalid=await page.request.post(origin+'/__somnia/source-events',{headers:{Origin:origin,'Content-Type':'application/json'},data:{file:'../secret',line:1,col:1}});if(invalid.status()!==400)throw Error('Traversal accepted');
 const outbound=await page.evaluate(async()=>{try{await fetch('https://example.com');return true;}catch{return false;}});if(outbound)throw Error('Outbound preview fetch allowed');
 if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify({preview:'passed',authentication:'passed',csp:'passed',clickToSource:'passed',outboundBlocked:true},null,2));
}finally{await browser?.close();proc?.kill();rmSync(dir,{recursive:true,force:true});}
