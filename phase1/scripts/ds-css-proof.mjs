/** Isolated browser evidence for P0, no app/WASM loading. Not an app E2E. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '@tailwindcss/node';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const compiler=await compile(readFileSync(resolve(root,'src/styles/global.css'),'utf8'),{base:resolve(root,'src/styles'),onDependency(){}});
const css=readFileSync(resolve(root,'src/styles/tokens.css'),'utf8')+'\n'+compiler.build(['bg-accent-fill','text-action-ink','text-ds-xs','z-dialog']);
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:980,height:660}});
 await page.setContent(`<style>${css}\nbody{overflow:auto;padding:24px}.proof{display:grid;grid-template-columns:repeat(2,1fr);gap:24px}.card{padding:24px;border:1px solid #888;border-radius:12px;background:#fff;color:#101014}.card.dark{background:#08080d;color:white}.card button{padding:10px 20px;font-size:13px}.ring{outline:3px solid var(--focus-ring);outline-offset:3px}</style><h1>P0 accent safety, isolated CSS proof</h1><p>Picked yellow seed stays unchanged. High contrast supplies safe action and focus roles.</p><div class="proof"></div>`);
 const results=[];
 for(const [theme,contrast] of [['light','standard'],['dark','standard'],['light','high'],['dark','high']]) {
  await page.evaluate(({theme,contrast})=>{
   const root=document.documentElement;root.dataset.theme=theme;root.dataset.contrast=contrast;
   root.style.setProperty('--accent','#ffff00');root.style.setProperty('--accent-fill','#ffff00');root.style.setProperty('--accent-soft','color-mix(in srgb, #ffff00 18%, transparent)');root.style.setProperty('--accent-ink','#101014');
  },{theme,contrast});
  const result=await page.evaluate(()=>{const cs=getComputedStyle(document.documentElement);return Object.fromEntries(['--accent','--accent-fill','--accent-ink','--focus-ring'].map(k=>[k,cs.getPropertyValue(k).trim()]));});
  assert.equal(result['--accent'],'#ffff00');
  assert.equal(result['--accent-fill'],contrast==='high'?(theme==='light'?'#3c2caf':'#b4a6ff'):'#ffff00');
  assert.equal(result['--accent-ink'],contrast==='high'&&theme==='light'?'#fff':'#101014');
  results.push({theme,contrast,...result});
  await page.evaluate(({theme,contrast,result})=>{const card=document.createElement('div');card.className=`card ${theme}`;card.innerHTML=`<h3>${theme} / ${contrast}</h3><p>seed #ffff00</p><br><button>Primary action</button><br><br><button class="ring">Focus ring</button>`;card.querySelectorAll('button').forEach(b=>{b.style.background=result['--accent-fill'];b.style.color=result['--accent-ink'];b.style.setProperty('--focus-ring',result['--focus-ring']);});document.querySelector('.proof').append(card);},{theme,contrast,result});
 }
 // Snapshot evidence is isolated CSS, not a substitute for studio baselines.
 mkdirSync(resolve(root,'test-results'),{recursive:true});
 await page.screenshot({path:resolve(root,'test-results/ds-p0-css-proof.png')});
 // Actual primary utility resolves custom ink instead of the former hard-coded white.
 await page.setContent(`<style>${css}</style><button data-slot="button" class="bg-accent-fill text-action-ink">Action</button>`);
 await page.evaluate(()=>{document.documentElement.style.setProperty('--accent-fill','#ffff00');document.documentElement.style.setProperty('--accent-ink','#101014');});
 const actual=await page.locator('button').evaluate(b=>({bg:getComputedStyle(b).backgroundColor,ink:getComputedStyle(b).color}));
 assert.deepEqual(actual,{bg:'rgb(255, 255, 0)',ink:'rgb(16, 16, 20)'});
 writeFileSync(resolve(root,'test-results/ds-p0-css-proof.json'),JSON.stringify({results,actual},null,2));
 console.log('P0 isolated CSS proof passed: custom action ink and all four theme/contrast cases.');
} finally {await browser.close();}
