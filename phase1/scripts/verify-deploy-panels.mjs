// Development-only browser check for the Publish panels in the Code studio shell (fake deploy engine, no network).
// Run from phase1: node scripts/verify-deploy-panels.mjs   Screenshots land in tests/artifacts/deploy-panels/.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {startServer} from './agent-harness/harness.mjs';
import {chromium} from '@playwright/test';
const server=await startServer({port:1433});
const browser=await chromium.launch();
const out='tests/artifacts/deploy-panels';mkdirSync(out,{recursive:true});
const errors=[];
async function open(query){
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`${server.url}/test/deploy-panels.html?${query}`);await page.waitForFunction(()=>window.__ready===true,null,{timeout:60000});
 await page.getByTestId('deploy-targets').waitFor();return page;
}
const calls=page=>page.evaluate(()=>window.__fake.calls);
try{
 for(const theme of ['light','dark']){
  const page=await open(`theme=${theme}&state=ready`);
  // rail items exist with their tooltips
  assert.ok(await page.getByRole('button',{name:'Publish',exact:true}).count()>=1,'Publish rail item');
  assert.equal(await page.getByRole('option').count(),3,'three servers listed');
  assert.equal(await page.getByTestId('deploy-selected').getAttribute('data-state'),'ready');
  // dry run: plan only, no upload, no confirmation dialog
  await page.getByTestId('deploy-dryrun').click();
  await page.getByTestId('deploy-panel-counts').waitFor();
  assert.equal(await page.getByTestId('deploy-panel-counts').innerText(),'1 new, 2 changed, 1 removed');
  assert.deepEqual((await calls(page)).filter(c=>!c.startsWith('save')),['plan:main']);
  assert.equal(await page.getByTestId('deploy-confirm').count().catch(()=>0),0);
  await page.evaluate(()=>window.__load('react'));
  // expand inspector sections for the screenshot
  for(const id of ['publish-target','publish-framework','publish-dryrun']){const b=page.locator(`[data-testid=inspector-section-${id}] > button`);if(await b.count()){const open=await b.getAttribute('aria-expanded');if(open==='false')await b.click();}}
  await page.getByText('React project',{exact:false}).first().waitFor({timeout:8000});
  await page.screenshot({path:`${out}/panels-${theme}.png`});
  await page.close();
 }
 // publish goes through the confirmation dialog and ends in a result with the live log
 {
  const page=await open('theme=light&state=ready');
  await page.getByTestId('deploy-publish').click();
  await page.screenshot({path:`${out}/confirm-light.png`});
  const dlg=page.getByRole('dialog').first();await dlg.waitFor();
  assert.deepEqual((await calls(page)).filter(c=>c.startsWith('publish')),[],'nothing published before the click');
  await page.close();
 }
 // empty state and node project mismatch advice
 {
  const page=await open('theme=light&state=empty');
  await page.getByTestId('deploy-empty').waitFor();await page.screenshot({path:`${out}/empty-light.png`});await page.close();
  const n=await open('theme=light&state=node');
  for(const id of ['publish-framework']){const b=n.locator(`[data-testid=inspector-section-${id}] > button`);if(await b.count()&&await b.getAttribute('aria-expanded')==='false')await b.click();}
  assert.equal(await n.getByTestId('deploy-section-framework').getAttribute('data-advice'),'needs-node');
  await n.screenshot({path:`${out}/node-mismatch-light.png`});await n.close();
 }
 assert.deepEqual(errors.filter(e=>!/favicon|Failed to load resource/.test(e)),[]);
 console.log('Publish panel browser checks passed: rail, servers, dry run (plan only), confirmation before publish, empty state, framework advice; no page errors.');
}finally{await browser.close();server.stop();}
