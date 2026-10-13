import {chromium} from '@playwright/test';
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {platform,arch,cpus,totalmem,release} from 'node:os';
import {summarize,sampleCount,validateScenarios,markdown} from './report.mjs';
import {requireArtifacts} from './preflight.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const runs=sampleCount(process.env.SOMNIA_PERF_SAMPLES??20);
const out=resolve(root,process.env.SOMNIA_PERF_OUT??'test-results/studio-performance');
const url=process.env.SOMNIA_PERF_URL??'http://127.0.0.1:1442';
const scenarios=validateScenarios(JSON.parse(readFileSync(new URL('./scenarios.json',import.meta.url),'utf8')));
const port=Number(new URL(url).port||80);
const timings=[],memory=[],errors=[];
let server,browser;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const record=(scenario,metric,samplesMs)=>timings.push({scenario,metric,samplesMs,summary:summarize(samplesMs)});
// Linux process-tree RSS snapshot: shared pages may be counted repeatedly, never add to JS heap.
function processTreeRss(pid){
 if(platform()!=='linux'||!pid)return null;
 try{
  const processes=execFileSync('ps',['-eo','pid=,ppid=,rss='],{encoding:'utf8'}).trim().split('\n').map(l=>l.trim().split(/\s+/).map(Number));
  const owners=new Set([pid]);let changed=true;
  while(changed){changed=false;for(const [id,parent] of processes)if(owners.has(parent)&&!owners.has(id)){owners.add(id);changed=true;}}
  return {bytes:processes.filter(([id])=>owners.has(id)).reduce((n,[,,rss])=>n+rss*1024,0),processCount:owners.size,scope:'Chromium tree RSS sum; shared pages may repeat; not private memory'};
 }catch{return null;}
}
async function frame(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function activate(page,scenario){
 // Clock starts in renderer at click dispatch, excludes Playwright actionability wait.
 await page.getByRole('radio',{name:scenario.label,exact:true}).evaluate(el=>{window.__perfStart=performance.now();el.click();});
 await page.locator(scenario.readySelector).first().waitFor({state:'visible',timeout:30_000});
 await frame(page);
 return page.evaluate(()=>performance.now()-window.__perfStart);
}
async function shell(page){await page.locator('[data-storage]').waitFor();await page.getByRole('radio',{name:'Somnia Code',exact:true}).waitFor();await frame(page);}
try {
 if(!process.env.SOMNIA_PERF_URL){
  requireArtifacts(root);
  if(!existsSync(resolve(root,'dist/index.html')))throw Error('Build real production app first (npm run build). Dev-server timings are not production baselines.');
  server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:['ignore','pipe','pipe']});
  let ready=false;for(let i=0;i<60;i++){if(server.exitCode!==null)throw Error('Preview server exited');try{if((await fetch(url)).ok){ready=true;break;}}catch{}await delay(500);}if(!ready)throw Error('Preview server did not start');
 }
 mkdirSync(out,{recursive:true});
 // launchServer exposes PID without relying on Playwright private properties.
 browser=await chromium.launchServer({headless:true});
 const client=await chromium.connect(browser.wsEndpoint());
 try {
  const startup=[];
  for(let i=0;i<runs+1;i++){
   const context=await client.newContext({locale:'en-US',viewport:{width:1440,height:900}});
   await context.addInitScript(()=>{localStorage.setItem('somnia.locale.v1','en');localStorage.removeItem('somnia.fixture');});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);await shell(page);
   const ms=await page.evaluate(()=>performance.now());if(i)startup.push(ms);
   await context.close();
  }
  record('empty-shell','navigation-startup',startup);
  for(const s of scenarios){
   const context=await client.newContext({locale:'en-US',viewport:{width:1440,height:900}});
   await context.addInitScript(()=>{localStorage.setItem('somnia.locale.v1','en');localStorage.removeItem('somnia.fixture');});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await shell(page);
   const cold=[];
   for(let i=0;i<runs+1;i++){
    if(i){await page.goto(url);await shell(page);}
    const ms=await activate(page,s);if(i)cold.push(ms);
   }
   record(s.id,'first-activation',cold);
   const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
   const samples=[];
   for(let i=0;i<runs+1;i++){
    await page.getByRole('radio',{name:'Somnia Code',exact:true}).click();await shell(page);
    const ms=await activate(page,s);if(i)samples.push(ms);
    await delay(250);
    const metrics=(await cdp.send('Performance.getMetrics')).metrics;
    memory.push({scenario:s.id,trial:i,warmup:i===0,rendererJsHeapUsedBytes:metrics.find(m=>m.name==='JSHeapUsedSize')?.value??null,rendererJsHeapTotalBytes:metrics.find(m=>m.name==='JSHeapTotalSize')?.value??null,processTree:processTreeRss(browser.process().pid)});
   }
   record(s.id,'return-activation',samples);
   await page.screenshot({path:resolve(out,`${s.id}.png`)});
   await context.close();
  }
  if(errors.length)throw Error(`Page errors: ${[...new Set(errors)].join('; ')}`);
  const report={schemaVersion:1,sha:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),createdAt:new Date().toISOString(),buildMode:process.env.SOMNIA_PERF_URL?'external URL; operator must record build/cache mode':'Vite production preview',fixture:'empty studios, no private files; not representative loaded engines',sampleRuns:runs,warmupRuns:1,environment:{node:process.version,platform:platform(),os:release(),arch:arch(),logicalCpus:cpus().length,totalMemoryBytes:totalmem(),browser:client.version(),viewport:{width:1440,height:900},powerState:'unverified'},timings,memory};
  writeFileSync(resolve(out,'baseline.json'),JSON.stringify(report,null,2)+'\n');writeFileSync(resolve(out,'baseline.md'),markdown(report));
  console.log(`Baseline written to ${out}; diagnostic only, no native/suspended-resume certification.`);
 }finally{await client.close();}
}catch(e){mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'failure.json'),JSON.stringify({status:'blocked-or-failed',error:String(e),timings,memory},null,2));console.error(e);process.exitCode=1;}
finally{if(browser)await browser.close();if(server)server.kill('SIGTERM');}
