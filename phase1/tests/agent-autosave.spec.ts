import {test,expect} from './fixtures';
test('applied agent content stays out of native stage until explicit Save',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('somnia.workflowPrefs.v1',JSON.stringify({draftAutosave:true,draftSeconds:1,startup:'last'}));
  const w=window as any;w.isTauri=true;let next=0;w.ipcCalls=[];
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++next,invoke:async(cmd:string,args:any)=>{
   w.ipcCalls.push({cmd,args});if(cmd==='plugin:event|listen')return ++next;if(cmd==='choose_project')return {projectId:'held-native',name:'Native hold fixture'};
   if(cmd==='list_files')return ['index.html'];if(cmd==='recovery_list')return [];
   if(cmd==='read_file')return {content:'<!doctype html><html><body><h1>Original</h1></body></html>',revision:{exists:true,hash:'base'},status:{}};
   if(cmd==='stage_edit'){w.latest=args;return {projectId:'held-native',path:args.path,clientRevision:args.clientRevision,state:'dirty',diskRevision:{exists:true,hash:'base'}};}
   if(cmd==='save_file')return {projectId:'held-native',path:args.path,clientRevision:w.latest.clientRevision,state:'saved',diskRevision:{exists:true,hash:'saved'}};
   return null;
  }};w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 });
 let calls=0;await page.route('http://127.0.0.1:11434/api/show',r=>r.fulfill({json:{model_info:{architecture:'fixture'}}}));
 await page.route('http://127.0.0.1:11434/api/chat',r=>r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({message:++calls===1?{content:'Proposal',tool_calls:[{function:{name:'code_propose_html',arguments:{from:0,to:58,text:'<!doctype html><html><body><h1>AI reviewed</h1></body></html>'}}}]}:{content:'Review it.'},done:true})+'\n'}));
 page.on('dialog',d=>d.accept());await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();await page.keyboard.press('Control+o');await expect(page.getByText('Native hold fixture',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open Somnia Agent'}).click();const panel=page.getByRole('complementary',{name:'Somnia Agent'});await panel.getByRole('button',{name:'Agent configuration',exact:true}).click();const S=page.getByRole('dialog');await S.getByLabel('Model',{exact:true}).fill('fixture');await S.getByRole('button',{name:'Save AI settings',exact:true}).click();await S.getByText('Configuration saved.',{exact:true}).waitFor();await S.getByRole('button',{name:'Close settings',exact:true}).click();
 await panel.getByLabel('Message to Somnia Agent').fill('Update title');await panel.getByRole('button',{name:'Send',exact:true}).click();await panel.getByRole('button',{name:'Accept once'}).click();await panel.getByRole('button',{name:'Accept preview',exact:true}).click();
 await expect(panel.getByText('Applied to editor, not saved.',{exact:false})).toBeVisible();await expect(page.frameLocator('iframe[title="Sandboxed design preview"]').locator('h1')).toHaveText('AI reviewed');
 await page.waitForTimeout(1600);const before=await page.evaluate(()=>(window as any).ipcCalls);expect(before.filter((c:any)=>c.cmd==='hold_autosave')).toHaveLength(1);expect(before.filter((c:any)=>c.cmd==='stage_edit'||c.cmd==='save_file')).toHaveLength(0);
 await page.getByRole('button',{name:'Files panel',exact:true}).focus();await page.keyboard.press('Control+s');await expect(page.locator('[data-storage]')).toHaveAttribute('data-dirty','false');
 const after=await page.evaluate(()=>(window as any).ipcCalls);expect(after.find((c:any)=>c.cmd==='stage_edit').args.content).toContain('AI reviewed');expect(after.filter((c:any)=>c.cmd==='save_file')).toHaveLength(1);
});
