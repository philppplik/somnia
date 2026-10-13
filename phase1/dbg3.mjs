import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
const vite=spawn('node',['node_modules/.bin/vite','--port','5231','--strictPort'],{cwd:process.cwd(),stdio:'pipe'});
let up=false; vite.stdout.on('data',d=>{if(d.toString().includes('Local:'))up=true;});
for(let i=0;i<90&&!up;i++)await new Promise(r=>setTimeout(r,1000));
console.log('vite up:',up);
const browser=await chromium.launch();
const page=await browser.newPage();
page.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,400)));
page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE:',m.text().slice(0,400));});
page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url().slice(0,140));});
await page.goto('http://localhost:5231/test/deploy-panels.html?theme=light&state=ready');
try{await page.waitForFunction(()=>window.__ready===true,null,{timeout:60000});console.log('READY OK');}
catch{console.log('READY TIMEOUT; __ready =',await page.evaluate(()=>window.__ready));}
await page.screenshot({path:'/tmp/dbg-deploy3.png'});
await browser.close(); vite.kill('SIGKILL'); process.exit(0);
