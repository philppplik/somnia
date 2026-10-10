import {test,expect} from './fixtures';
test.use({sample:false});
// File association launch (#164): the OS passes the file in argv, the Rust side stores it and the
// renderer pulls it once through open_startup_file, then the normal open pipeline takes over.
test('a file passed at launch opens through the normal native pipeline',async({page})=>{
 await page.addInitScript(()=>{
  const w=window as any;w.isTauri=true;let next=0;w.ipcCalls=[];w.startupFile=true;
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++next,invoke:async(cmd:string,args:any)=>{
   w.ipcCalls.push({cmd,args});if(cmd==='plugin:event|listen')return ++next;
   if(cmd==='open_startup_file')return w.startupFile?{projectId:'startup',name:'launch.html'}:null;
   if(cmd==='list_files')return ['launch.html'];
   if(cmd==='read_file')return {content:'<html><body><h1>Launched title</h1></body></html>',revision:{exists:true,hash:'disk'},status:{}};
   if(cmd==='stage_edit')return {projectId:args.projectId,path:args.path,clientRevision:args.clientRevision,state:'dirty',diskRevision:{exists:true,hash:'disk'}};
   if(cmd==='recovery_list')return [];return null;
  }};w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 });
 await page.goto('/');
 await expect(page.locator('[data-storage]')).toHaveAttribute('data-storage','disk',{timeout:15000});
 await expect(page.getByText('launch.html',{exact:true}).first()).toBeVisible();
 await expect(page.frameLocator('iframe[title="Sandboxed design preview"]').locator('h1')).toHaveText('Launched title');
 const calls=await page.evaluate(()=>(window as any).ipcCalls.map((c:any)=>c.cmd));
 expect(calls).toContain('open_startup_file');
});
test('without a startup file the app boots untouched',async({page})=>{
 await page.addInitScript(()=>{
  const w=window as any;w.isTauri=true;let next=0;w.ipcCalls=[];
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++next,invoke:async(cmd:string)=>{w.ipcCalls.push(cmd);if(cmd==='plugin:event|listen')return ++next;return null;}};
  w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 });
 await page.goto('/');
 await expect(page.locator('[data-storage]')).toHaveAttribute('data-storage','memory');
 await page.waitForTimeout(500);
 await expect(page.locator('[data-storage]')).toHaveAttribute('data-storage','memory');
});
