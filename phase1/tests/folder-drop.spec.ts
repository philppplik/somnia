import {test,expect} from './fixtures';
test.use({sample:false});
async function native(page:any){
 await page.addInitScript(()=>{
  const w=window as any;w.isTauri=true;let next=0;const callbacks=new Map<number,any>(),handlers=new Map<string,number>();w.ipcCalls=[];w.dropMode='ok';
  w.fireDrop=(token='os-token',count=1)=>{const handler=handlers.get('somnia://os-drop');callbacks.get(handler!)?.({event:'somnia://os-drop',id:handler,payload:{token,count}});};
  w.fireHover=(type:string)=>{const handler=handlers.get(type==='leave'?'tauri://drag-leave':'tauri://drag-enter');callbacks.get(handler!)?.({event:'tauri://drag-enter',id:handler,payload:{paths:['C:\\Site'],position:{x:100,y:100}}});};
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:(fn:any)=>{callbacks.set(++next,fn);return next;},invoke:async(cmd:string,args:any)=>{
   w.ipcCalls.push({cmd,args});if(cmd==='plugin:event|listen'){handlers.set(args.event,args.handler);return ++next;}
   if(cmd==='open_dropped_project'){if(w.dropMode==='denied')throw 'expired or forged token';return {projectId:args.token,name:args.token==='file'?'single.html':'Dropped site'};}
   if(cmd==='read_dropped_files'){if(w.dropMode==='mixed')throw 'Drop one folder alone';return [{name:'one.txt',text:'One'},{name:'two.txt',text:'Two'}];}
   if(cmd==='list_files'){if(w.dropMode==='slow'){w.dropMode='ok';await new Promise<void>(resolve=>{w.releaseRead=resolve;});}if(w.dropMode==='read-error')throw 'unreadable folder';return ['index.html','styles.css'];}
   if(cmd==='read_file')return {content:args.path==='index.html'?'<html><body><h1>Dropped title</h1></body></html>':'h1 {color:red}',revision:{exists:true,hash:'disk'},status:{}};
   if(cmd==='stage_edit')return {projectId:args.projectId,path:args.path,clientRevision:args.clientRevision,state:'dirty',diskRevision:{exists:true,hash:'disk'}};if(cmd==='recovery_list')return [];return null;
  }};w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 });
 await page.goto('/');await expect.poll(()=>page.evaluate(()=>(window as any).ipcCalls.some((c:any)=>c.cmd==='plugin:event|listen'&&c.args.event==='somnia://os-drop'))).toBe(true);
}
test('native folder drop opens disk project with opaque token, and hover clears',async({page})=>{
 await native(page);await page.evaluate(()=>(window as any).fireHover('enter'));await expect(page.getByTestId('drop-overlay')).toBeVisible();await page.screenshot({path:'tests/artifacts/folder-drop-overlay.png'});
 await page.evaluate(()=>{(window as any).fireHover('leave');(window as any).fireDrop();});await expect(page.getByTestId('drop-overlay')).toHaveCount(0);await expect(page.getByText('Dropped site',{exact:true})).toBeVisible();await expect(page.locator('[data-storage]')).toHaveAttribute('data-storage','disk');await expect(page.frameLocator('iframe[title="Sandboxed design preview"]').locator('h1')).toHaveText('Dropped title');
 const calls=await page.evaluate(()=>(window as any).ipcCalls);expect(calls.find((c:any)=>c.cmd==='open_dropped_project').args).toEqual({token:'os-token'});expect(calls.some((c:any)=>c.cmd==='choose_project')).toBe(false);
});
test('cancel dirty memory replacement never consumes the drop',async({page})=>{
 await native(page);await page.evaluate(async()=>{const {addTextFiles}=await import('/src/lib/projectActions.ts' as string);addTextFiles([{name:'index.html',text:'<h1>Start</h1>'}]);(window as any).__somnia.setSource('index.html','<h1>Keep me</h1>');});page.once('dialog',d=>d.dismiss());await page.evaluate(()=>(window as any).fireDrop());await expect(page.frameLocator('iframe[title="Sandboxed design preview"]').locator('h1')).toHaveText('Keep me');expect(await page.evaluate(()=>(window as any).ipcCalls.some((c:any)=>c.cmd==='open_dropped_project'))).toBe(false);
});
test('unreadable candidate and forged token preserve the current disk project',async({page})=>{
 await native(page);await page.evaluate(()=>(window as any).fireDrop());await expect(page.getByText('Dropped site',{exact:true})).toBeVisible();
 await page.evaluate(()=>{(window as any).dropMode='read-error';(window as any).fireDrop('bad-folder');});await expect(page.getByRole('status')).toContainText('unreadable folder');await expect(page.getByText('Dropped site',{exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).ipcCalls.filter((c:any)=>c.cmd==='close_project').map((c:any)=>c.args.projectId))).toEqual(['bad-folder']);
 await page.evaluate(()=>{(window as any).dropMode='denied';(window as any).fireDrop('forged');});await expect(page.getByRole('status')).toContainText('forged');await expect(page.getByText('Dropped site',{exact:true})).toBeVisible();
});
test('multiple native files import copies; a mixed folder/file selection is refused',async({page})=>{
 await native(page);await page.evaluate(()=>(window as any).fireDrop('files',2));await expect(page.getByRole('status')).toContainText('Opened 2 files');await expect(page.locator('[data-storage]')).toHaveAttribute('data-storage','memory');
 await page.evaluate(()=>{(window as any).dropMode='mixed';(window as any).fireDrop('mixed',2);});await expect(page.getByRole('status')).toContainText('Drop one folder alone');
});
test('single native file uses the in-place project command',async({page})=>{await native(page);await page.evaluate(()=>(window as any).fireDrop('file'));await expect(page.getByText('single.html',{exact:true})).toBeVisible();await expect(page.locator('[data-storage]')).toHaveAttribute('data-storage','disk');});

test('edits during candidate loading abort the switch without closing the current project',async({page})=>{
 await native(page);await page.evaluate(()=>(window as any).fireDrop());await expect(page.getByText('Dropped site',{exact:true})).toBeVisible();
 await page.evaluate(()=>{(window as any).dropMode='slow';(window as any).fireDrop('slow-folder');});await expect.poll(()=>page.evaluate(()=>typeof (window as any).releaseRead)).toBe('function');
 await page.evaluate(()=>{(window as any).__somnia.setSource('index.html','<html><body><h1>Latest edits</h1></body></html>');(window as any).releaseRead();});
 await expect(page.getByRole('status')).toContainText('changed while opening');await expect(page.frameLocator('iframe[title="Sandboxed design preview"]').locator('h1')).toHaveText('Latest edits');
 expect(await page.evaluate(()=>(window as any).ipcCalls.filter((c:any)=>c.cmd==='close_project').map((c:any)=>c.args.projectId))).toEqual(['slow-folder']);
});
