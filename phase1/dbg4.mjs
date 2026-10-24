import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
const out='/tmp/shots-deploy';mkdirSync(out,{recursive:true});
const vite=spawn('node',['node_modules/.bin/vite','--port','5231','--strictPort'],{cwd:process.cwd(),stdio:'pipe'});
let up=false; vite.stdout.on('data',d=>{if(d.toString().includes('Local:'))up=true;});
for(let i=0;i<90&&!up;i++)await new Promise(r=>setTimeout(r,1000));
console.log('vite up:',up);
const browser=await chromium.launch();
async function open(query){
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,200)));
 await page.goto(`http://localhost:5231/test/deploy-panels.html?${query}`);
 await page.waitForFunction(()=>window.__ready===true,null,{timeout:60000});
 await page.getByTestId('deploy-targets').waitFor();return page;
}
for(const theme of ['light','dark']){
 const page=await open(`theme=${theme}&state=ready`);
 await page.getByTestId('deploy-dryrun').click();
 await page.getByTestId('deploy-panel-counts').waitFor();
 await page.evaluate(()=>window.__load('react'));
 for(const id of ['publish-target','publish-framework','publish-dryrun']){const b=page.locator(`[data-testid=inspector-section-${id}] > button`);if(await b.count()){const open2=await b.getAttribute('aria-expanded');if(open2==='false')await b.click();}}
 try{await page.getByText('React project',{exact:false}).first().waitFor({timeout:8000});}catch{console.log('note: React project label wait skipped');}
 await page.screenshot({path:`${out}/panels-${theme}.png`});console.log('shot panels-'+theme);
 await page.close();
}
{
 const page=await open('theme=light&state=ready');
 await page.getByTestId('deploy-publish').click();
 await page.screenshot({path:`${out}/confirm-light.png`});console.log('shot confirm');
 await page.close();
}
{
 const page=await open('theme=light&state=empty');
 await page.getByTestId('deploy-empty').waitFor();
 await page.screenshot({path:`${out}/empty-light.png`});console.log('shot empty');
 await page.close();
}
await browser.close(); vite.kill('SIGKILL'); console.log('ALL DONE'); process.exit(0);
