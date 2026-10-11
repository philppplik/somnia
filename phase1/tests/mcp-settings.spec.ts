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
test('mcp args: fail-closed interpreter rejects before the approval dialog and the bridge',async({page})=>{
 await page.addInitScript(()=>{
  const w=window as any;w.isTauri=true;let next=0;w.ipcCalls=[];
  const tools=[{server:'files',name:'strict',description:'s',input_schema:{type:'object',required:['p'],additionalProperties:false,properties:{p:{type:'string',pattern:'^[a-z]+$'}}}},{server:'files',name:'fancy',description:'f',input_schema:{type:'object',properties:{p:{not:{type:'null'}}}}}];
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++next,invoke:async(cmd:string)=>{
   w.ipcCalls.push({cmd});if(cmd==='plugin:event|listen')return ++next;
   if(cmd==='mcp_servers_list')return [{config:{id:'files',command:'/bin/x',args:[],env:{}},running:true}];
   if(cmd==='mcp_server_start')return tools;
   if(cmd==='mcp_tool_call')return 'ran';
   return null;
  }};w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 });
 await page.goto('/');
 const out=await page.evaluate(async()=>{
  const m=await import('/src/lib/agent/mcpRuntime.ts');const e=await import('/src/lib/agent/editorTools.ts');
  const rt=m.getMcpRuntime()!;await rt.start('files');for(const t of rt.getSnapshot().tools)rt.setGranted(t,true);
  const r=e.createEditorToolRegistry({allowExecute:true});const names=rt.register(r);
  const g={levels:['read','propose','execute']} as any;const ctx={files:()=>({}),propose:async()=>{}} as any;const sig=new AbortController().signal;
  const tryRun=async(n:string,a:any)=>{try{await r.run(n,a,ctx,sig,g);return 'ok';}catch(x:any){return x.name+':'+x.message;}};
  const bad=await tryRun(names[0],{p:'ABC'});const extra=await tryRun(names[0],{p:'abc',q:1});const missing=await tryRun(names[0],{});const fancy=await tryRun(names[1],{p:1});
  return {n:names.length,bad,extra,missing,fancy,pending:rt.getSnapshot().pending.length,activity:rt.getSnapshot().activity.map(a=>a.outcome)};
 });
 expect(out.n).toBe(2);
 expect(out.bad).toContain('McpArgsError');expect(out.bad).toContain('wrong format');
 expect(out.extra).toContain('not an allowed argument');expect(out.missing).toContain('p is required');
 expect(out.fancy).toContain('unsupported keyword');
 expect(out.pending).toBe(0);expect(out.activity).toEqual(['invalid','invalid','invalid','invalid']);
 await expect(page.getByRole('alertdialog')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).ipcCalls.map((c:any)=>c.cmd))).not.toContain('mcp_tool_call');
});
