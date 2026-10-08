import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
const open=async(page:Page)=>{await page.goto('/');await page.getByRole('button',{name:'Open Somnia Agent'}).click();return page.getByRole('complementary',{name:'Somnia Agent'});};
const saveAI=async(page:Page)=>{const s=page.getByRole('dialog');await s.getByRole('button',{name:'Save AI settings',exact:true}).click();await s.getByText('Configuration saved.',{exact:true}).waitFor();await s.getByRole('button',{name:'Close settings',exact:true}).click();};
const tab=(page:Page,name:string)=>page.getByRole('dialog').getByRole('tab',{name,exact:true}).click();
async function model(page:Page){
 await page.route('http://127.0.0.1:11434/api/show',r=>r.fulfill({json:{model_info:{architecture:'fixture'}}}));
 const panel=await open(page);await panel.getByRole('button',{name:'Agent configuration',exact:true}).click();
 const settings=page.getByRole('dialog');await settings.getByLabel('Model', {exact:true}).fill('fixture-local');await settings.getByRole('button',{name:'Save AI settings',exact:true}).click();await settings.getByText('Configuration saved.',{exact:true}).waitFor();await settings.getByRole('button',{name:'Close settings',exact:true}).click();return panel;
}
async function fixture(page:Page,mode:'edit'|'slow'='edit'){
 let calls=0;
 await page.route('http://127.0.0.1:11434/api/chat',async r=>{
  const n=++calls;await new Promise(resolve=>setTimeout(resolve,mode==='slow'?1200:150));
  const message=n===1&&mode==='edit'?{content:'I can propose a new project stylesheet.',tool_calls:[{function:{name:'write_file',arguments:{path:'agent-test.css',content:'h1 { font-size: 56px; }\n\np { line-height: 1.6; }'}}}]}:{content:'Please review the proposed change before applying it.'};
  await r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({message,done:true,prompt_eval_count:15,eval_count:20})+'\n'});
 });
}
test('opener sits at bottom of rail and toggles the panel',async({page})=>{await page.goto('/');
 const rail=page.getByRole('toolbar',{name:'Inspector panels'});const btn=rail.getByRole('button',{name:'Open Somnia Agent'});
 await expect(btn).toHaveAttribute('aria-pressed','false');await expect(btn.locator('svg[data-icon="vadivam:sparkles"]')).toHaveCount(1);
 const rb=await rail.boundingBox(),bb=await btn.boundingBox();expect(bb!.y+bb!.height).toBeGreaterThan(rb!.y+rb!.height-24);
 await btn.click();await expect(page.getByRole('complementary',{name:'Somnia Agent'})).toBeVisible();await expect(btn).toHaveAttribute('aria-pressed','true');
 await page.screenshot({path:'tests/artifacts/agent-panel-integrated.png'});
 await page.getByRole('button',{name:'Collapse panel'}).click();await expect(page.getByRole('complementary',{name:'Somnia Agent'})).toHaveCount(0);
});
test('chips fill input only; no unimplemented references; bottom gradient only',async({page})=>{const panel=await open(page);
 await panel.getByRole('button',{name:'Help me design a landing page'}).click();await expect(panel.getByLabel('Message to Somnia Agent')).toHaveValue('Help me design a landing page');
 await expect(panel.getByRole('button',{name:'Stop'})).toHaveCount(0);await expect(panel.getByText('Use @ to refer')).toHaveCount(0);await expect(panel.locator('.ag-bar')).toHaveCount(1);
});
test('real session stages a file, asks permission, reviews hunks, applies without save and editor undo reverts',async({page})=>{
 await fixture(page);const panel=await model(page);const input=panel.getByLabel('Message to Somnia Agent');await input.fill('Create a stylesheet');await input.press('Enter');
 await expect(panel.getByRole('button',{name:'Stop'})).toBeVisible();await expect(input).toBeDisabled();
 await expect(panel.getByRole('region',{name:'File access approval'})).toBeVisible();await panel.getByRole('button',{name:'Accept once'}).click();
 await expect(panel.getByRole('region',{name:'Review agent changes'})).toBeVisible();
 await page.screenshot({path:'tests/artifacts/agent-hunk-review-integrated.png'});
 await panel.getByRole('button',{name:'Accept all',exact:true}).click();await panel.getByRole('button',{name:/Apply 1 change/}).click();
 await expect(panel.getByText('Applied to editor, not saved.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Files panel',exact:true}).click();await expect(page.getByText('agent-test.css',{exact:true}).last()).toBeVisible();
 await panel.getByRole('button',{name:'New chat'}).click();await page.getByRole('button',{name:'Files panel',exact:true}).focus();await page.keyboard.press('Control+z');await expect(page.getByText('agent-test.css',{exact:true})).toHaveCount(0);
 await panel.getByRole('button',{name:'New chat'}).click();await expect(panel.getByRole('heading',{name:'What are we building?'})).toBeVisible();
});
test('stop cancels a real provider run without review; streaming state visible',async({page})=>{await fixture(page,'slow');const panel=await model(page);
 await panel.getByLabel('Message to Somnia Agent').fill('Explain');await panel.getByLabel('Message to Somnia Agent').press('Enter');await expect(panel.getByRole('button',{name:'Stop'})).toBeVisible();
 await page.screenshot({path:'tests/artifacts/agent-streaming-integrated.png'});
 await panel.getByRole('button',{name:'Stop'}).click();await expect(panel.getByRole('button',{name:'Send'})).toBeVisible();await page.waitForTimeout(1500);await expect(panel.locator('.ag-review')).toHaveCount(0);
});
test('cloud consent modal explicit and shortcut works',async({page})=>{await page.goto('/');await expect(page.getByRole('button',{name:'Open Somnia Agent'})).toBeVisible();await page.keyboard.press('Control+Alt+a');const panel=page.getByRole('complementary',{name:'Somnia Agent'});await expect(panel).toBeVisible();
 await panel.getByRole('button',{name:'Cloud data consent',exact:true}).click();const modal=page.getByRole('dialog');await expect(modal.getByRole('button',{name:'Allow cloud AI',exact:true})).toBeDisabled();
 await expect(modal.getByRole('checkbox',{name:/I agree/})).not.toBeChecked();await page.screenshot({path:'tests/artifacts/agent-consent-integrated.png'});await modal.getByRole('button',{name:'Close settings',exact:true}).click();await expect(modal).toHaveCount(0);
});
test('unconfigured core fails honestly instead of demo reply',async({page})=>{const panel=await open(page);await panel.getByLabel('Message to Somnia Agent').fill('Hi');await panel.getByRole('button',{name:'Send',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Choose a provider and model');await expect(panel.locator('.ag-review')).toHaveCount(0);});
test('true NDJSON text streaming is labelled and cancellable',async({page})=>{
 const {createServer}=await import('node:http');const server=createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type');
  if(req.method==='OPTIONS'){res.end();return;}
  if(req.url==='/api/show'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({model_info:{architecture:'fixture'}}));return;}
  res.setHeader('Content-Type','application/x-ndjson');res.write(JSON.stringify({message:{content:'This is streamed AI text. '},done:false})+'\n');
  const timer=setTimeout(()=>res.end(JSON.stringify({message:{content:'Finished.'},done:true})+'\n'),2500);res.on('close',()=>clearTimeout(timer));
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(11434,'127.0.0.1',resolve);});
 try{
  const panel=await open(page);await panel.getByRole('button',{name:'Agent configuration',exact:true}).click();await page.getByRole('dialog').getByLabel('Model',{exact:true}).fill('stream-fixture');await saveAI(page);
  await panel.getByLabel('Message to Somnia Agent').fill('Explain streaming');await panel.getByRole('button',{name:'Send',exact:true}).click();
  await expect(panel.getByText('This is streamed AI text.',{exact:false})).toBeVisible();await expect(panel.locator('.ag-caret')).toBeVisible();await expect(panel.getByRole('button',{name:'Stop'})).toBeVisible();
  await page.screenshot({path:'tests/artifacts/agent-streaming-integrated.png'});await panel.getByRole('button',{name:'Stop'}).click();await expect(panel.getByRole('button',{name:'Send',exact:true})).toBeVisible();
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('declining file access never exposes an applicable proposal',async({page})=>{
 await fixture(page);const panel=await model(page);await panel.getByLabel('Message to Somnia Agent').fill('Create stylesheet');await panel.getByRole('button',{name:'Send',exact:true}).click();
 await panel.getByRole('button',{name:'Decline',exact:true}).click();await expect(panel.getByRole('button',{name:'Send',exact:true})).toBeVisible();await expect(panel.getByRole('region',{name:'Review agent changes'})).toHaveCount(0);
});
test('OpenRouter never starts inference without explicit cloud consent',async({page})=>{
 let requests=0;await page.route('https://openrouter.ai/api/v1/chat/completions',r=>{requests++;return r.abort();});
 const panel=await open(page);await panel.getByRole('button',{name:'Agent configuration',exact:true}).click();await page.getByRole('dialog').getByRole('combobox',{name:'Provider',exact:true}).selectOption('openrouter');await page.getByRole('dialog').getByLabel('Model',{exact:true}).fill('fixture/model');await page.getByRole('dialog').getByLabel('API key').fill('fixture-not-a-real-key');await saveAI(page);
 await panel.getByLabel('Message to Somnia Agent').fill('Hello cloud');await panel.getByRole('button',{name:'Send',exact:true}).click();await expect(panel.getByRole('alert')).toBeVisible();expect(requests).toBe(0);await expect(panel.getByRole('region',{name:'Review agent changes'})).toHaveCount(0);
});
test('saved model and custom prompts survive reload; preview never stores API key',async({page})=>{
 const panel=await open(page);await panel.getByRole('button',{name:'Agent configuration',exact:true}).click();
 const S=page.getByRole('dialog');
 await S.getByRole('combobox',{name:'Provider',exact:true}).selectOption('openrouter');await S.getByLabel('Model',{exact:true}).fill('fixture/persistent');
 await S.getByLabel('API key',{exact:true}).fill('fixture-not-real');await tab(page,'Instructions');await S.getByRole('button',{name:'Add custom prompt'}).click();
 await S.getByLabel('Prompt name 1',{exact:true}).fill('My style');await S.getByLabel('Prompt text 1',{exact:true}).fill('Use short sentences.');
 await saveAI(page);
 const prefs=await page.evaluate(()=>localStorage.getItem('somnia.agent.preferences.v1'));expect(prefs).not.toContain('fixture-not-real');expect(prefs).not.toContain('allowActiveFile');
 await page.reload();await page.getByRole('button',{name:'Open Somnia Agent',exact:true}).click();const restored=page.getByRole('complementary',{name:'Somnia Agent'});
 await restored.getByRole('button',{name:'Agent configuration',exact:true}).click();await expect(S.getByLabel('Model',{exact:true})).toHaveValue('fixture/persistent');await expect(S.getByLabel('API key',{exact:true})).toHaveValue('');
 await tab(page,'Instructions');await expect(S.getByLabel('Prompt text 1',{exact:true})).toHaveValue('Use short sentences.');await expect(S.getByRole('checkbox',{name:'Enable prompt 1',exact:true})).toBeChecked();
 await S.getByRole('checkbox',{name:'Enable prompt 1',exact:true}).uncheck();await saveAI(page);
 await restored.getByRole('button',{name:'Agent configuration',exact:true}).click();await tab(page,'Instructions');await S.getByRole('button',{name:'Delete prompt 1',exact:true}).click();await expect(S.getByLabel('Prompt text 1',{exact:true})).toHaveCount(0);
});
