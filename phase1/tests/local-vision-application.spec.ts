import {test,expect} from './fixtures';
/** Integrated app spec. Requires generated WASM bridges; execution belongs to CI. Synthetic Ollama only. */
for(const destination of ['text','alt'] as const)test(`local vision ${destination} goes through complete review and undo, never saves`,async({page})=>{
 let images=0;
 await page.addInitScript(()=>localStorage.setItem('somnia.agent.preferences.v1',JSON.stringify({provider:'ollama',model:'fixture-vision',customPrompts:[],localRuntime:{version:1,numCtx:8192}})));
 await page.route('http://127.0.0.1:11434/api/show',r=>r.fulfill({json:{model_info:{architecture:'fixture'},capabilities:['completion','vision']}}));
 await page.route('http://127.0.0.1:11434/api/chat',r=>{const request=r.request().postDataJSON();expect(request.tools??[]).toEqual([]);expect(request.messages[0].images).toHaveLength(1);images++;return r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({message:{content:'A red square on a white background.'},done:true,done_reason:'stop'})+'\n'});});
 await page.goto('/');
 await page.evaluate(async destination=>{const {EditorProject}=await import('/packages/editor-core/src/index.ts');const {connectEditorProject,patchState,getState}=await import('/src/store/appStore.ts');
  const path=destination==='text'?'notes.md':'index.html';connectEditorProject(new EditorProject({[path]:destination==='text'?'# Notes':'<img src="data:image/png;base64,AA==" alt="Before">'}));
  patchState({activeStudio:'code',selectedElementId:destination==='alt'?getState().nodes.find(n=>n.tag==='img')!.id:null});
 },destination);
 await page.getByRole('button',{name:'Open Somnia Agent',exact:true}).click();const panel=page.getByRole('complementary',{name:'Somnia Agent'});
 await panel.getByText('Describe a local image (opt-in)',{exact:true}).click();
 const fixture=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,64,64);ctx.fillStyle='red';ctx.fillRect(16,16,32,32);return canvas.toDataURL('image/png').split(',')[1];});
 await panel.getByLabel('Image to disclose').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});
 await expect(panel.getByRole('button',{name:'Describe selected image',exact:true})).toBeDisabled();await panel.getByRole('checkbox',{name:'Send this prepared image to local model fixture-vision',exact:true}).check();await panel.getByRole('button',{name:'Describe selected image',exact:true}).click();
 await panel.getByRole('button',{name:destination==='text'?'Preview as text':'Preview as alt text',exact:true}).click();const review=panel.getByRole('region',{name:'Review native AI proposal'});await expect(review).toContainText('A red square on a white background.');
 const read=()=>page.evaluate(async()=>{const {getState}=await import('/src/store/appStore.ts');return getState().files[getState().activeFile];});const before=await read();expect(before).not.toContain('A red square');
 await review.getByRole('button',{name:'Accept preview',exact:true}).click();await expect(panel.getByText('Applied to editor, not saved.',{exact:true})).toBeVisible();expect(await read()).toContain('A red square');
 await expect.poll(()=>page.evaluate(async()=>{const {heldAgentPaths}=await import('/src/lib/agent/autosaveHold.ts');return heldAgentPaths();})).toContain(destination==='text'?'notes.md':'index.html');
 await panel.screenshot({path:`tests/artifacts/local-vision-${destination}-accepted.png`});
 await panel.getByRole('button',{name:'Undo image description',exact:true}).click();await expect(panel.getByText('Image description undone. Nothing saved.',{exact:true})).toBeVisible();expect(await read()).toBe(before);expect(images).toBe(1);
});
