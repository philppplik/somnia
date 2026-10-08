import {test,expect} from './fixtures';
// MCP settings UI and per-call approval over a mocked Tauri IPC (no real server is started).
test('mcp settings: add, start, grant a tool; per-call approval dialog',async({page})=>{
 await page.addInitScript(()=>{
  const w=window as any;w.isTauri=true;let next=0;w.ipcCalls=[];let servers:any[]=[];let running=false;
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++next,invoke:async(cmd:string,args:any)=>{
   w.ipcCalls.push({cmd,args});if(cmd==='plugin:event|listen')return ++next;
   if(cmd==='mcp_servers_list')return servers.map(c=>({config:c,running}));
   if(cmd==='mcp_server_save'){servers=[args.config];running=false;return null;}
   if(cmd==='mcp_server_start'){running=true;return [{server:'files',name:'read_note',description:'Reads a note',input_schema:{type:'object',properties:{}}}];}
   if(cmd==='mcp_server_stop'){running=false;return null;}
   return null;
  }};w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 });
 await page.goto('/');
 await page.evaluate(async()=>{const m=await import('/src/store/appStore.ts');m.patchState({settingsOpen:true,settingsSection:'AI',settingsAITab:'tools'});});
 const s=page.getByTestId('mcp-settings');await expect(s).toBeVisible();
 await s.getByLabel('Name (a-z, 0-9, - _)').fill('files');await s.getByLabel('Program (full path)').fill('/usr/bin/my-mcp');
 await s.getByTestId('mcp-save').click();await expect(s.getByTestId('mcp-server')).toContainText('files');
 await s.getByRole('button',{name:'Start'}).click();
 const box=s.getByRole('checkbox',{name:/read_note/});await expect(box).toBeVisible();await expect(box).not.toBeChecked();await box.check();await expect(box).toBeChecked();
 if(process.env.SOMNIA_SHOTS)await page.screenshot({path:`${process.env.SOMNIA_SHOTS}/mcp-settings.png`});
 // approval dialog, deny then allow
 const res=await page.evaluate(async()=>{const m=await import('/src/lib/agent/mcpRuntime.ts');const rt=m.getMcpRuntime()!;(window as any).p=rt.approve({server:'files',tool:'read_note',args:{path:'a.md'}},new AbortController().signal);return rt.getSnapshot().pending.length;});
 expect(res).toBe(1);const dlg=page.getByRole('alertdialog');await expect(dlg).toContainText('read_note');await expect(page.getByTestId('mcp-approval-args')).toContainText('a.md');
 if(process.env.SOMNIA_SHOTS)await page.screenshot({path:`${process.env.SOMNIA_SHOTS}/mcp-approval.png`});
 await page.getByTestId('mcp-deny').click();expect(await page.evaluate(()=>(window as any).p)).toBe(false);
 await page.evaluate(async()=>{const m=await import('/src/lib/agent/mcpRuntime.ts');(window as any).q=m.getMcpRuntime()!.approve({server:'files',tool:'read_note',args:{}},new AbortController().signal);});
 await page.getByTestId('mcp-allow').click();expect(await page.evaluate(()=>(window as any).q)).toBe(true);
 const calls=await page.evaluate(()=>(window as any).ipcCalls.map((c:any)=>c.cmd));expect(calls).toContain('mcp_server_save');expect(calls).not.toContain('mcp_tool_call');
});
