import {test,expect} from './fixtures';
test.use({sample:false});
// File association launch (#164, 12.1.0): the OS passes the file in argv, the Rust side enqueues an
// open request, and the intake orchestrator drains it through the normal #166 open pipeline
// (drain -> claim -> one-shot grant read -> ack). There is no open_startup_file shortcut anymore.
const HTML='<html><body><h1>Launched title</h1></body></html>';
const mockIntake=(w:any,withFile:boolean)=>{
 w.isTauri=true;let next=0;w.ipcCalls=[];
 w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++next,invoke:async(cmd:string,args:any)=>{
  w.ipcCalls.push({cmd,args});if(cmd==='plugin:event|listen')return ++next;
  if(cmd==='drain_open_requests')return withFile?[{id:'r1',source:'argv',generation:1,items:[{ordinal:0,displayName:'launch.html'}]}]:[];
  if(cmd==='claim_open_request')return {items:[{ordinal:0,grant:'g1',displayName:'launch.html',ext:'html',size:HTML.length,identityToken:'tok-launch',status:'granted'}]};
  if(cmd==='read_by_grant')return {name:'launch.html',ext:'html',size:HTML.length,identityToken:'tok-launch',dataBase64:btoa(HTML)};
  if(cmd==='ack_open_request')return {accepted:[0],retryTokens:[]};
  if(cmd==='list_crash_reports')return [];
  if(cmd==='recovery_list')return [];return null;
 }};w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
};
test('a file passed at launch opens through the intake pipeline',async({page})=>{
 await page.addInitScript(mockIntake,true);
 await page.goto('/');
 await expect(page.getByText('launch.html',{exact:true}).first()).toBeVisible({timeout:15000});
 await expect(page.frameLocator('iframe[title="Sandboxed design preview"]').locator('h1')).toHaveText('Launched title');
 const calls=await page.evaluate(()=>(window as any).ipcCalls.map((c:any)=>c.cmd));
 expect(calls).toContain('drain_open_requests');
 expect(calls).toContain('claim_open_request');
 expect(calls).toContain('read_by_grant');
 expect(calls).toContain('ack_open_request');
 expect(calls).not.toContain('open_startup_file');
});
test('without a startup file the app boots untouched',async({page})=>{
 await page.addInitScript(mockIntake,false);
 await page.goto('/');
 await expect(page.locator('[data-storage]')).toHaveAttribute('data-storage','memory');
 await page.waitForTimeout(500);
 await expect(page.locator('[data-storage]')).toHaveAttribute('data-storage','memory');
 const calls=await page.evaluate(()=>(window as any).ipcCalls.map((c:any)=>c.cmd));
 expect(calls).toContain('drain_open_requests');
 expect(calls).not.toContain('claim_open_request');
});
