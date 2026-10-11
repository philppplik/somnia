/** Offline browser verification for the Memory panel and Skills tab (package A6).
 * Run: node src/components/vibespace/memory-skills-browser.mjs   Screenshots: VIBESPACE_SCREENSHOTS or test-results/. */
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdtemp,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=dirname(fileURLToPath(import.meta.url));
const out=await mkdtemp(join(tmpdir(),'vibespace-ms-'));
await build({entryPoints:[join(here,'memory-skills-entry.tsx')],outfile:join(out,'f.js'),bundle:true,format:'iife',jsx:'automatic',loader:{'.css':'css','.json':'json'}});
const css=await readFile(join(out,'f.css'),'utf8'),js=await readFile(join(out,'f.js'),'utf8');
const shots=process.env.VIBESPACE_SCREENSHOTS??'test-results/vibespace-memory-skills';await mkdir(shots,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[];
const open=async(init,viewport={width:1000,height:1200})=>{
 const page=await browser.newPage({viewport});page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(`<html><head><style>:root{--text-primary:#252631;--text-secondary:#555b69;--bg-panel:#f8f9fb;--bg-elevated:#fff;--bg-surface:#eff0f5;--border-subtle:#d0d3dc}body{margin:0;padding:24px;background:#e9ebf2;font-family:Arial,sans-serif}${css}</style></head><body><div id="root"></div></body></html>`);
 await page.evaluate(init);await page.addScriptTag({content:js});return page;
};
// ---- Memory
let p=await open(()=>{});
await p.getByRole('heading',{name:'Memory',exact:true}).waitFor();
await p.getByText('The site is built with Vite').waitFor();
assert.equal(await p.getByText('Waiting for your review').count()>0,true,'agent item shows review state');
assert.equal(await p.evaluate(()=>window.memFixture.calls.some(c=>c.type==='downloadModel'||c.type==='enableVector')),false,'nothing downloads or enables by itself');
await p.screenshot({path:join(shots,'memory-default.png'),fullPage:true});
// opt-in: download needs a second explicit click and sends the exact size
await p.getByRole('button',{name:/Download model \(465 MB\)/}).click();
assert.equal(await p.evaluate(()=>window.memFixture.calls.some(c=>c.type==='downloadModel')),false,'first click only asks');
await p.screenshot({path:join(shots,'memory-download-confirm.png'),fullPage:true});
await p.getByRole('button',{name:'Download 465 MB now'}).click();
await p.getByRole('progressbar').waitFor();
assert.equal(await p.evaluate(()=>window.memFixture.calls.find(c=>c.type==='downloadModel').acknowledgedBytes),487352505);
await p.screenshot({path:join(shots,'memory-downloading.png'),fullPage:true});
await p.getByRole('button',{name:'Cancel',exact:true}).first().click();
await p.getByRole('button',{name:/Download model/}).waitFor();
await p.evaluate(()=>window.memFixture.finishDownload());await p.getByRole('button',{name:/Download model/}).click();await p.getByRole('button',{name:'Download 465 MB now'}).click();
await p.evaluate(()=>window.memFixture.finishDownload());
// poll refresh picks up ready state
await p.getByText('Model is on your computer.').waitFor({timeout:5000});
const enable=p.getByRole('button',{name:'Turn on for this space'});assert.ok(await enable.isDisabled(),'enable needs the checkbox');
await p.getByRole('checkbox').check();await enable.click();
await p.getByText(/On\. 2 of 2 items indexed/).waitFor();
await p.screenshot({path:join(shots,'memory-on.png'),fullPage:true});
await p.getByRole('textbox',{name:'Search memory'}).fill('plain');await p.getByRole('button',{name:'Search',exact:true}).click();
await p.getByText('Search mode: Keyword + meaning').waitFor();
await p.getByRole('button',{name:'Turn off and delete vectors'}).click();await p.getByText('Off. Keyword search works without it.').waitFor();
// delete + clear all needs confirmation
await p.locator('[data-memory-id=m1]').getByRole('button',{name:'Delete'}).click();await p.locator('[data-memory-id=m1]').waitFor({state:'detached'});
await p.getByRole('button',{name:'Delete all memory in this space'}).click();
assert.equal(await p.evaluate(()=>window.memFixture.calls.some(c=>c.type==='clearAll')),false,'clear-all asks first');
await p.getByRole('button',{name:'Delete',exact:true}).last().click();await p.getByText('Nothing remembered yet.').waitFor();
// reject a pending item path
await p.close();
p=await open(()=>{});await p.locator('[data-memory-id=m2]').getByRole('button',{name:'Discard'}).click();await p.locator('[data-memory-id=m2]').waitFor({state:'detached'});
assert.deepEqual(await p.evaluate(()=>window.memFixture.calls.find(c=>c.type==='review')),{type:'review',id:'m2',approve:false});
await p.close();
// German + narrow
p=await open(()=>{window.msLocale='de';},{width:430,height:932});
await p.getByRole('heading',{name:'Gedächtnis',exact:true}).waitFor();
assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no horizontal overflow (narrow)');
await p.screenshot({path:join(shots,'memory-de-narrow.png'),fullPage:true});await p.close();
// ---- Skills
p=await open(()=>{window.msView='skills';});
await p.getByRole('heading',{name:'Skills',exact:true}).waitFor();
await p.screenshot({path:join(shots,'skills-list.png'),fullPage:true});
const risky=p.locator('[data-skill=risky]');
await risky.getByText('Unreviewed: instructions only, scripts are disabled.').waitFor();
await risky.getByRole('button',{name:'View contents'}).click();
await risky.getByText('1 serious finding(s)').waitFor();await risky.getByText('A clean scan is not a safety guarantee.').waitFor();
await risky.getByText('Requested tools (not approved): Bash').waitFor();
await p.screenshot({path:join(shots,'skills-scan.png'),fullPage:true});
assert.equal(await p.getByRole('button',{name:/run|execute/i}).count(),0,'no run/execute control exists');
const pdf=p.locator('[data-skill=pdf-tools]');
await pdf.getByRole('button',{name:'Review changes'}).click();
await pdf.getByLabel('SKILL.md diff').waitFor();await pdf.getByText('scripts/run.sh (changed)').waitFor();
await pdf.getByText('Newly requested tools: Bash').waitFor();await pdf.getByText(/network-call/).waitFor();
assert.equal(await p.evaluate(()=>window.skillsFixture.calls.some(c=>c.type==='acceptUpdate')),false,'diff shown before accept');
await p.screenshot({path:join(shots,'skills-update-diff.png'),fullPage:true});
await pdf.getByRole('button',{name:'Accept update'}).click();await pdf.getByRole('button',{name:'Review changes'}).waitFor({state:'detached'});
await p.getByText('Browsing the index is not available in this build.').waitFor();
await p.getByRole('textbox',{name:'Paste SKILL.md'}).fill('---\nname: new-skill\ndescription: x\n---\nhi');await p.getByRole('button',{name:'Scan and install'}).click();
await p.locator('[data-skill=new-skill]').waitFor();
const inst=await p.evaluate(()=>window.skillsFixture.calls.find(c=>c.type==='install'));assert.deepEqual([inst.scope,inst.spaceId,inst.source,inst.files.length],['space','space-1','local',0]);
await p.close();
assert.deepEqual(errors,[]);
await browser.close();console.log(`Memory/Skills browser fixture passed. Screenshots: ${shots}`);
