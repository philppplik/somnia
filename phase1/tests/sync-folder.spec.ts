import {test,expect} from './fixtures';
async function mock(page:any,remote:string|null){
 await page.addInitScript((remote:string|null)=>{
  const w=window as any;let next=0;w.isTauri=true;w.ipcCalls=[];w.syncFile=remote;w.syncName=remote?'Cloud':null;
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++next,invoke:async(cmd:string,args:any)=>{w.ipcCalls.push(cmd);
   if(cmd==='plugin:event|listen')return ++next;
   if(cmd==='sync_status')return w.syncName;
   if(cmd==='sync_choose'){w.syncName='Cloud';return 'Cloud';}
   if(cmd==='sync_read')return w.syncFile===null?null:{content:w.syncFile,modifiedMs:Date.now()};
   if(cmd==='sync_write'){w.syncFile=args.content;return null;}
   if(cmd==='sync_clear'){w.syncName=null;return null;}
   if(cmd==='recovery_list')return [];
   return null;}};
  w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 },remote);
}
const open=async(page:any)=>{await page.goto('/');await expect(page.getByRole('radio',{name:'Somnia Code',exact:true})).toBeVisible();await page.keyboard.press('Control+,');const d=page.getByRole('dialog');await d.getByRole('button',{name:'Modified',exact:true}).click();return d;};
test('choosing a folder with no file writes local settings and shortcuts there',async({page})=>{
 await mock(page,null);const d=await open(page);
 await d.getByTestId('sync-choose').click();
 await expect(d.getByTestId('sync-folder-name')).toContainText('Cloud');
 await expect.poll(()=>page.evaluate(()=>(window as any).syncFile)).toContain('"kind": "sync"');
 await d.getByTestId('sync-stop').click();await expect(d.getByTestId('sync-choose')).toBeVisible();
});
test('a newer file in the folder is applied when nothing changed locally',async({page})=>{
 await mock(page,JSON.stringify({app:'somnia',kind:'sync',version:1,updatedAt:Date.now(),settings:{'workflow.units':'imperial'},shortcuts:{}}));
 const d=await open(page);
 await d.getByTestId('sync-now').click();
 await expect(d.getByTestId('sync-note')).toContainText('applied');
 await expect(d.getByTestId('modified-workflow.units')).toBeVisible();
});
