/** Offline browser regression for the production form and native adapter boundary. */
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdtemp,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=dirname(fileURLToPath(import.meta.url)),out=await mkdtemp(join(tmpdir(),'vs-picker-'));
await build({entryPoints:[join(here,'model-picker-fixture-entry.tsx')],outfile:join(out,'fixture.js'),bundle:true,format:'esm',jsx:'automatic',loader:{'.css':'css'}});
const js=await readFile(join(out,'fixture.js'),'utf8'),css=await readFile(join(out,'fixture.css'),'utf8');
const shots=process.env.VIBESPACE_SCREENSHOTS??out;await mkdir(shots,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
 await page.goto('http://fixture.test');
 await page.setContent(`<html><head><style>body{margin:0;padding:24px;background:#e9ebf2;font-family:Arial}#root{height:780px}${css}</style></head><body><div id="root"></div></body></html>`);
 await page.addScriptTag({type:'module',content:js});

 await page.getByRole('button',{name:'New Studio',exact:true}).waitFor();
 await page.getByRole('button',{name:'New Studio',exact:true}).click();
 const picker=page.getByRole('combobox',{name:'Model',exact:true});
 await page.getByText('No configured model. Add a model in AI settings first.',{exact:true}).waitFor();assert.equal(await picker.isDisabled(),true);
 await page.screenshot({path:join(shots,'model-picker-empty.png')});
 await page.evaluate(()=>window.modelPickerHarness.save('openai','synthetic-a'));
 await page.waitForFunction(()=>!document.querySelector('select').disabled);
 assert.equal(await picker.locator('option').count(),2);
 await page.getByRole('textbox',{name:'Goal',exact:true}).fill('Check fixture only');
 await picker.selectOption({label:'openai / synthetic-a (cloud)'});
 assert.equal(await page.getByRole('button',{name:'Create Studio',exact:true}).isEnabled(),true);
 await page.getByText(/This cloud model receives/).waitFor();
 await page.screenshot({path:join(shots,'model-picker-configured.png')});
 // All providers offered by AI settings must be selectable after a save.
 for(const provider of ['ollama','openai','openrouter','claude']){
  await page.evaluate(p=>window.modelPickerHarness.save(p,'synthetic-'+p),provider);
  await picker.locator('option',{hasText:'synthetic-'+provider}).waitFor({state:'attached'});
  assert.equal(await picker.inputValue(),'');
  await picker.selectOption({index:1});
  assert.equal(await page.getByRole('button',{name:'Create Studio',exact:true}).isEnabled(),true);
 }
 // Replacing a configured model must not silently substitute the selection.
 await page.evaluate(()=>window.modelPickerHarness.save('ollama','synthetic-local'));
 await page.getByRole('option',{name:'ollama / synthetic-local (local)'}).waitFor({state:'attached'});
 assert.equal(await picker.inputValue(),'');assert.equal(await page.getByRole('button',{name:'Create Studio',exact:true}).isDisabled(),true);
 await picker.selectOption({index:1});assert.equal(await page.getByText(/This cloud model receives/).count(),0);
 await page.getByRole('button',{name:'Create Studio',exact:true}).click();
 await page.waitForFunction(()=>window.modelPickerHarness.requests.length===1);
 assert.deepEqual(await page.evaluate(()=>window.modelPickerHarness.requests[0]),{spaceId:'space-demo',goal:'Check fixture only',model:{provider:'ollama',model:'synthetic-local',locality:'local'}});
 // Reopening a template form reads the native authority even without a settings event.
 await page.evaluate(()=>window.modelPickerHarness.setModels([{provider:'openrouter',model:'synthetic-template',locality:'cloud'}]));
 await page.getByRole('button',{name:/Polish a page/}).click();
 await picker.locator('option',{hasText:'synthetic-template'}).waitFor({state:'attached'});await picker.selectOption({index:1});
 assert.equal(await page.getByRole('button',{name:'Create Studio',exact:true}).isEnabled(),true);
 await page.screenshot({path:join(shots,'model-picker-template.png')});
 assert.deepEqual(errors,[]);
 console.log(`Model picker regression passed. Screenshots: ${shots}`);
}finally{await browser.close();}
