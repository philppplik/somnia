/** Standalone Chromium panel checks. No desktop app or project scripts are run. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {chromium} from '@playwright/test';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.env.SOMNIA_PANEL_SCREENSHOTS || '/tmp/somnia-panel-screenshots';
mkdirSync(out,{recursive:true});
const fixture={
 'index.html':`<h1>Digital design for people</h1><h2>Our work</h2><h3>Studio North</h3><h2>Services</h2><h4>Web design</h4><h3>Identity & brand</h3><h2> </h2><h2>Contact</h2><a href="about.html?x=1#contact">About</a><img src="assets/hero.webp" srcset="assets/hero.webp 1x, assets/hero@2x.webp 2x"><a href="#pricing">Pricing</a><a href="pages/team.html">Team</a><a href="https://example.org/docs">Docs</a><a href="{{ route }}">Dynamic</a><script>window.projectScriptExecuted=true</script>`,
 'about.html':'<h1 id="contact">Contact</h1><h2></h2>',
 'pages/team.html':'<h1>Team</h1><a href="../company.html">Company</a>',
 'assets/hero.webp':'BINARY-DO-NOT-READ'
};
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
let assertions=0;
function check(value,expected){assert.deepEqual(value,expected);assertions++}
async function panel(slug,project,width=340,denied=false){
 const manifest=JSON.parse(readFileSync(join(root,'examples',slug,'somnia-extension.json'),'utf8'));
 const html=readFileSync(join(root,'examples',slug,'panel.html'),'utf8');check(manifest.contributes.panels[0].html,html);check(manifest.permissions,['project.read']);check(manifest.code,undefined);check(manifest.main,undefined);
 const page=await browser.newPage({viewport:{width,height:1050}});const errors=[];const requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.setContent('<iframe title="Test extension panel" sandbox="allow-scripts" style="width:100%;height:100vh;border:0"></iframe><style>body{margin:0}</style>');
 const bridge=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:"><script>const fixture=${JSON.stringify(project).replaceAll('<','\\u003c')};window.reads=[];window.somnia={project:{listFiles:async()=>{${denied?'throw Error("project.read revoked")':'return Object.keys(fixture).sort()'}},readFile:async p=>{reads.push(p);if(fixture[p]==='BINARY-DO-NOT-READ')throw Error('Binary file read');return fixture[p]}}};</script>`;
 await page.locator('iframe').evaluate((el,source)=>el.srcdoc=source,html.replace('<head>','<head>'+bridge));
 const frame=page.frames()[1];await frame.waitForFunction(()=>document.getElementById('refresh')?.disabled===false);
 return {page,frame,errors,requests};
}
async function metrics(frame){return frame.evaluate(()=>['m1','m2','m3'].map(id=>Number(document.getElementById(id).textContent)))}
async function finish(p){check(p.errors,[]);check(p.requests,[]);check(await p.frame.evaluate(()=>window.projectScriptExecuted),undefined);check(await p.frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.page.close()}
try{
 for(const width of [340,260])for(const slug of ['local-link-check','heading-outline']){
  const p=await panel(slug,fixture,width);
  if(slug==='local-link-check'){check(await metrics(p.frame),[3,7,2]);check(await p.frame.evaluate(()=>reads.includes('assets/hero.webp')),false);await p.frame.selectOption('#kind','missing');check(await p.frame.locator('#results article').count(),3)}
  else{check(await metrics(p.frame),[11,3,2]);await p.frame.selectOption('#file','index.html');await p.frame.selectOption('#kind','4');check(await p.frame.locator('#results article').count(),1);assert.match(await p.frame.locator('#results').innerText(),/Level jump H2 → H4/);assertions++;await p.frame.selectOption('#kind','');}
  await p.page.locator('iframe').evaluate((el,h)=>el.style.height=h+'px',await p.frame.evaluate(()=>document.documentElement.scrollHeight));
  await p.frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await p.page.screenshot({path:join(out,`${slug}-${width}.png`),fullPage:true});await finish(p);
 }
 // Base URL, escaped names, named anchors, queries, SVG, server routes and malformed srcset.
 const project={
  'pages/start.html':`<base href="../assets/"><a href="../about.html?q=yes#caf%C3%A9">ok</a><a href="../named.html#old">named</a><img src="./a%20b.png?v=2"><img srcset="data:image/png;base64,AAAA 1x, missing.png 2x"><img src="icon.svg#shape"><a href="/about.html#caf%C3%A9">root</a><a href="../route">server</a><a href="../folder/">directory</a><a href="../ABOUT.html">case</a><img srcset="a.png bad"><img src="a%2fb.png"><a href="../about.html#absent">missing fragment</a><a href="../about.html#bad%ZZ">invalid fragment</a>`,
  'about.html':'<h1 id="café">About</h1>','named.html':'<a name="old">Old</a>',
  'assets/a b.png':'BINARY-DO-NOT-READ','assets/icon.svg':'<svg xmlns="http://www.w3.org/2000/svg"><path id="shape"/></svg>'
 };
 const edge=await panel('local-link-check',project);check(await metrics(edge.frame),[3,8,6]);const edgeText=await edge.frame.locator('#results').innerText();assert.match(edgeText,/Directory or server route/);assert.match(edgeText,/Invalid srcset descriptor/);assert.match(edgeText,/Ambiguous percent-encoded path/);assertions+=3;await finish(edge);
 const ext=await panel('local-link-check',{'index.html':'<base href="https://outside.invalid/"><a href="local.html">external base</a><a href="${route}">dynamic</a>'});check(await metrics(ext.frame),[0,0,2]);await finish(ext);
 const synthetic=await panel('local-link-check',{'index.html':'<a href="https://snapshot.invalid/index.html">Still external</a>'});check(await metrics(synthetic.frame),[0,0,1]);await finish(synthetic);
 const heads=await panel('heading-outline',{'first.html':'<h3>First</h3><h4><script>unsafe text</script></h4><h1>First H1</h1><h1>Second H1</h1><template><h2>Excluded</h2></template>','second.html':'<h1>Independent</h1><h2>&lt;img src=x onerror=alert(1)&gt;</h2>'});check(await metrics(heads.frame),[6,3,1]);check(await heads.frame.locator('#results img').count(),0);await finish(heads);
 for(const slug of ['local-link-check','heading-outline']){
  const empty=await panel(slug,{});check(await metrics(empty.frame),[0,0,0]);await finish(empty);
  const denied=await panel(slug,{},340,true);assert.match(await denied.frame.locator('#status').innerText(),/Enable project.read/);assertions++;check(await denied.frame.locator('#refresh').isEnabled(),true);await finish(denied);
  const refreshed=await panel(slug,fixture);await refreshed.frame.evaluate(()=>fixture['index.html']='<h1 id="fresh">Unsaved edit</h1>');await refreshed.frame.locator('#refresh').click();await refreshed.frame.waitForFunction(()=>!document.getElementById('refresh').disabled);if(slug==='heading-outline')assert.match(await refreshed.frame.locator('#results').innerText(),/Unsaved edit/);else check(await metrics(refreshed.frame),[1,1,0]);await finish(refreshed);
 }
 console.log(`PASS ${assertions} assertions; sandboxed Chromium, no network requests. Screenshots: ${out}`);
}finally{await browser.close()}
