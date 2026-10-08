import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
async function setup(page:Page){
 await page.route('http://127.0.0.1:11434/api/show',r=>r.fulfill({json:{model_info:{architecture:'fixture'}}}));
 await page.goto('/');
 await page.evaluate(async()=>{const {EditorProject}=await import('/packages/editor-core/src/index.ts');const {connectEditorProject,openFileTab,patchState}=await import('/src/store/appStore.ts');connectEditorProject(new EditorProject({'index.html':'<h1>Hello</h1>','other.html':'<p>Private other document</p>'}),{alreadySaved:true});openFileTab('index.html');patchState({viewMode:'code'});});
 await page.getByRole('button',{name:'Open Somnia Agent',exact:true}).click();const panel=page.getByRole('complementary',{name:'Somnia Agent'});
 await panel.getByRole('button',{name:'Agent configuration',exact:true}).click();const s=page.getByRole('dialog');await s.getByLabel('Model',{exact:true}).fill('fixture-local');await s.getByRole('button',{name:'Save AI settings',exact:true}).click();await s.getByText('Configuration saved.',{exact:true}).waitFor();await s.getByRole('button',{name:'Close settings',exact:true}).click();
 await panel.getByRole('checkbox',{name:/Allow inspecting/}).check();return panel;
}
async function proposal(page:Page,panel:ReturnType<Page['getByRole']>,after='<h1>Better</h1>'){
 let round=0;let context:any;
 await page.route('http://127.0.0.1:11434/api/chat',async r=>{
  context=r.request().postDataJSON();const message=round++===0?{content:'Proposing one source edit.',tool_calls:[{function:{name:'code_propose_html',arguments:{from:0,to:14,text:after}}}]}:{content:'Review the complete preview. Nothing is saved.'};
  await r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({message,done:true})+'\n'});
 });
 await panel.getByLabel('Message to Somnia Agent').fill('Improve the heading');await panel.getByRole('button',{name:'Send',exact:true}).click();await expect(panel.getByRole('region',{name:'Review native AI proposal'})).toBeVisible();return ()=>context;
}
async function text(page:Page){return page.evaluate(async()=>{const {getState}=await import('/src/store/appStore.ts');return getState().files['index.html'];});}
test.use({viewport:{width:1440,height:1100}});
test('native preview -> accept -> origin undo; active scope disclosed; no implicit save',async({page})=>{
 const panel=await setup(page);const context=await proposal(page,panel);expect(await text(page)).toBe('<h1>Hello</h1>');
 expect(JSON.stringify(context().messages)).not.toContain('Private other document');expect(context().tools.map((t:any)=>t.function.name)).not.toContain('write_file');
 await panel.getByText('Isolated before / after preview',{exact:true}).click();await expect(page.frameLocator('iframe[title="After AI edit"]').getByRole('heading',{name:'Better'})).toBeVisible();
 await panel.getByRole('region',{name:'Review native AI proposal'}).scrollIntoViewIfNeeded();await page.screenshot({path:'tests/artifacts/ai-core-preview.png'});
 await panel.getByRole('button',{name:'Accept preview',exact:true}).click();await expect.poll(()=>text(page)).toBe('<h1>Better</h1>');
 expect(await page.evaluate(async()=>{const {getState}=await import('/src/store/appStore.ts');return getState().isDirty;})).toBe(true);
 await page.screenshot({path:'tests/artifacts/ai-core-accepted.png'});
 await panel.getByRole('button',{name:'Undo AI transaction',exact:true}).click();await expect.poll(()=>text(page)).toBe('<h1>Hello</h1>');
});
test('reject is non-mutating and a concurrent manual edit blocks acceptance',async({page})=>{
 const panel=await setup(page);await proposal(page,panel);await panel.getByRole('button',{name:'Reject proposal',exact:true}).click();expect(await text(page)).toBe('<h1>Hello</h1>');
 await panel.getByRole('button',{name:'New chat',exact:true}).click();await proposal(page,panel);
 await page.evaluate(async()=>{const {applyOperations}=await import('/src/store/appStore.ts');applyOperations([{type:'replaceSource',file:'index.html',text:'<h1>Typed while reviewing</h1>'}],'code');});
 await panel.getByRole('button',{name:'Accept preview',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Document changed');expect(await text(page)).toBe('<h1>Typed while reviewing</h1>');
});
test('guest cannot accept and selected source goes into bounded context',async({page})=>{
 const panel=await setup(page);await page.evaluate(async()=>{const {getActiveEditor}=await import('/src/lib/editorBridge.ts');getActiveEditor()!.dispatch({selection:{anchor:4,head:9}});});
 const context=await proposal(page,panel);const data=context().messages.find((m:any)=>m.content.startsWith('Untrusted active document context'));expect(data.content).toContain('"text":"Hello"');
 await page.evaluate(async()=>{const {getCollabEngine,setCollabEngine}=await import('/src/lib/collab/store.ts');const original=getCollabEngine();const snapshot={...original.snapshot(),role:'guest' as const};setCollabEngine({snapshot:()=>snapshot,subscribe:()=>()=>{},leave:async()=>{},startHosting:async()=>{},stopHosting:async()=>{},join:async()=>{}} as any);});
 await panel.getByRole('button',{name:'Accept preview',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Only the collaboration host');expect(await text(page)).toBe('<h1>Hello</h1>');
});

test('tab switching cannot retarget a run and later manual edit blocks origin undo',async({page})=>{
 const panel=await setup(page);await proposal(page,panel);
 await page.evaluate(async()=>{const {openFileTab}=await import('/src/store/appStore.ts');openFileTab('other.html');});
 await panel.getByRole('button',{name:'Accept preview',exact:true}).click();await expect.poll(()=>text(page)).toBe('<h1>Better</h1>');
 expect(await page.evaluate(async()=>{const {getState}=await import('/src/store/appStore.ts');return getState().files['other.html'];})).toBe('<p>Private other document</p>');
 await page.evaluate(async()=>{const {applyOperations}=await import('/src/store/appStore.ts');applyOperations([{type:'replaceSource',file:'other.html',text:'<p>Later user change</p>'}],'code');});
 await panel.getByRole('button',{name:'Undo AI transaction',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Later edits exist');expect(await text(page)).toBe('<h1>Better</h1>');
});
test('cloud provider needs run-specific disclosure even with inspection and general cloud consent',async({page})=>{
 let requests=0;await page.route('https://openrouter.ai/api/v1/chat/completions',r=>{requests++;return r.abort();});
 const panel=await setup(page);await panel.getByRole('button',{name:'Agent configuration',exact:true}).click();const s=page.getByRole('dialog');await s.getByRole('combobox',{name:'Provider',exact:true}).selectOption('openrouter');await s.getByLabel('Model',{exact:true}).fill('fixture/model');await s.getByRole('button',{name:'Save AI settings',exact:true}).click();await s.getByText('Configuration saved.',{exact:true}).waitFor();await s.getByRole('button',{name:'Close settings',exact:true}).click();
 await page.evaluate(async()=>{const {agentPrivacy}=await import('/src/lib/agent/privacy.ts');agentPrivacy.grantExplicitConsent();});
 await panel.getByLabel('Message to Somnia Agent').fill('Improve');await panel.getByRole('button',{name:'Send',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Confirm disclosure');expect(requests).toBe(0);
});
