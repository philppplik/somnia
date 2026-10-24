import {test,expect} from './fixtures';
// A7 e2e: MCP consent dialog, schema-pinned grants, revoke. Everything runs against a mocked
// Tauri IPC; no real MCP server is started. Covers the WebView trust model (consent per call, grants
// pinned to the tool schema, silent grant drop on schema change, immediate revoke, activity log
// without arguments) and the broker-side AllowForRun path: the consent dialog offers Deny, Allow
// once and Allow for this session; the session choice creates a digest-bound grant that shows in
// the grants view, skips the dialog for the exact same tool definition, and revokes from the view.
const cfg={id:'files',command:'/usr/bin/my-mcp',args:[],env:{}};
const toolV1={server:'files',name:'read_note',description:'Reads a note',input_schema:{type:'object',properties:{path:{type:'string'}}}};
const toolV2={server:'files',name:'read_note',description:'Reads a note, now with folder support',input_schema:{type:'object',required:['path'],properties:{path:{type:'string'},folder:{type:'string'}}}};
const toolWrite={server:'files',name:'write_note',description:'Writes a note',input_schema:{type:'object',properties:{path:{type:'string'},text:{type:'string'}}}};
// addInitScript serializes the function; everything it needs arrives via the arg (no closures).
function mockIpc(v1:any[],v2?:any[]):[ (a:any)=>void, any ]{
 return [(a:{cfg:any;v1:any[];v2:any[]|null})=>{
  const w=window as any;w.isTauri=true;let next=0;w.ipcCalls=[];let running=false;
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++next,invoke:async(cmd:string)=>{
   w.ipcCalls.push({cmd});if(cmd==='plugin:event|listen')return ++next;
   if(cmd==='mcp_servers_list')return [{config:a.cfg,running}];
   if(cmd==='mcp_server_start'){running=true;return a.v2&&w.__v===2?a.v2:a.v1;}
   if(cmd==='mcp_server_stop'){running=false;return null;}
   if(cmd==='mcp_tool_call')return 'ran';
   return null;
  }};w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 },{cfg,v1,v2:v2??null}];
}
async function openMcpSettings(page:any){
 await page.goto('/');
 await page.evaluate(async()=>{const m=await import('/src/store/appStore.ts');m.patchState({settingsOpen:true,settingsSection:'AI',settingsAITab:'tools'});});
 const s=page.getByTestId('mcp-settings');await expect(s).toBeVisible();return s;
}
test('mcp grant pins the tool schema: a changed server definition silently drops the grant',async({page})=>{
 await page.addInitScript(...mockIpc([toolV1],[toolV2]));
 const s=await openMcpSettings(page);
 await s.getByRole('button',{name:'Start'}).click();
 const box=s.getByRole('checkbox',{name:/read_note/});await expect(box).toBeVisible();await box.check();await expect(box).toBeChecked();
 expect(await page.evaluate(async()=>{const m=await import('/src/lib/agent/mcpRuntime.ts');const rt=m.getMcpRuntime()!;return rt.isGranted(rt.getSnapshot().tools[0]);})).toBe(true);
 // The server restarts with a changed definition (description + schema). The grant must not survive.
 await s.getByRole('button',{name:'Stop'}).click();
 await page.evaluate(()=>{(window as any).__v=2;});
 await s.getByRole('button',{name:'Start'}).click();
 const box2=s.getByRole('checkbox',{name:/read_note/});await expect(box2).toBeVisible();await expect(box2).not.toBeChecked();
 const state=await page.evaluate(async()=>{
  const m=await import('/src/lib/agent/mcpRuntime.ts');const t=await import('/src/lib/agent/mcpTools.ts');
  const rt=m.getMcpRuntime()!;const snap=rt.getSnapshot();
  return {granted:rt.isGranted(snap.tools[0]),registered:rt.register(t.createMcpRegistry()).length,tools:snap.tools.length};
 });
 expect(state.tools).toBe(1);expect(state.granted).toBe(false);expect(state.registered).toBe(0);
 if(process.env.SOMNIA_SHOTS)await page.screenshot({path:`${process.env.SOMNIA_SHOTS}/mcp-grant-dropped.png`});
});
test('mcp grants: revoking a grant unregisters the tool immediately',async({page})=>{
 await page.addInitScript(...mockIpc([toolV1,toolWrite]));
 const s=await openMcpSettings(page);
 await s.getByRole('button',{name:'Start'}).click();
 await s.getByRole('checkbox',{name:/read_note/}).check();await s.getByRole('checkbox',{name:/write_note/}).check();
 const both=await page.evaluate(async()=>{const m=await import('/src/lib/agent/mcpRuntime.ts');const t=await import('/src/lib/agent/mcpTools.ts');return m.getMcpRuntime()!.register(t.createMcpRegistry());});
 expect(both.length).toBe(2);
 await s.getByRole('checkbox',{name:/write_note/}).uncheck();
 const after=await page.evaluate(async()=>{
  const m=await import('/src/lib/agent/mcpRuntime.ts');const t=await import('/src/lib/agent/mcpTools.ts');
  const names=m.getMcpRuntime()!.register(t.createMcpRegistry());
  const grants=JSON.parse(localStorage.getItem('somnia.mcp.grants.v1')??'{}');
  return {names,grantKeys:Object.keys(grants)};
 });
 expect(after.names.length).toBe(1);expect(after.names[0]).toContain('read_note');
 expect(after.grantKeys.length).toBe(1);expect(after.grantKeys[0]).toContain('read_note');
 if(process.env.SOMNIA_SHOTS)await page.screenshot({path:`${process.env.SOMNIA_SHOTS}/mcp-grants.png`});
});
test('mcp consent: deny and allow-once per call, activity log without arguments, no bridge call on deny',async({page})=>{
 await page.addInitScript(...mockIpc([toolV1]));
 const s=await openMcpSettings(page);
 await s.getByRole('button',{name:'Start'}).click();
 await s.getByRole('checkbox',{name:/read_note/}).check();
 const kick=async(slot:string,arg:string)=>page.evaluate(async([slot,arg])=>{
  const m=await import('/src/lib/agent/mcpRuntime.ts');const t=await import('/src/lib/agent/mcpTools.ts');
  const r=t.createMcpRegistry();const name=m.getMcpRuntime()!.register(r)[0];
  const ctx={files:()=>({}),propose:async()=>{}} as any;const g={levels:['read','propose','execute']} as any;
  (window as any)[slot]=r.run(name,{path:arg},ctx,new AbortController().signal,g).then((v:any)=>({v})).catch((e:any)=>({err:String((e as Error).message||e)}));
 },[slot,arg]);
 // Deny: the call is refused, the bridge never runs, the refusal is logged.
 await kick('run1','a.md');
 const dlg=page.getByRole('alertdialog');await expect(dlg).toBeVisible();await expect(dlg).toContainText('read_note');await expect(page.getByTestId('mcp-approval-args')).toContainText('a.md');
 if(process.env.SOMNIA_SHOTS)await page.screenshot({path:`${process.env.SOMNIA_SHOTS}/mcp-consent-dialog.png`});
 await page.getByTestId('mcp-deny').click();
 const denied=await page.evaluate(()=>(window as any).run1);
 expect(denied.err).toContain('did not approve');
 expect(await page.evaluate(()=>(window as any).ipcCalls.filter((c:any)=>c.cmd==='mcp_tool_call').length)).toBe(0);
 // Allow once: exactly one bridge call, no standing permission created.
 await kick('run2','b.md');
 await expect(page.getByRole('alertdialog')).toBeVisible();
 await page.getByTestId('mcp-allow').click();
 const allowed=await page.evaluate(()=>(window as any).run2);
 expect(allowed.v).toContain('untrusted');
 expect(await page.evaluate(()=>(window as any).ipcCalls.filter((c:any)=>c.cmd==='mcp_tool_call').length)).toBe(1);
 // Activity log: both outcomes recorded, newest first, arguments never stored.
 await page.evaluate(async()=>{const m=await import('/src/store/appStore.ts');m.patchState({settingsOpen:true,settingsSection:'AI',settingsAITab:'tools'});});
 const rows=page.getByTestId('mcp-activity-row');await expect(rows).toHaveCount(2);
 await expect(rows.first()).toContainText('read_note');await expect(rows.first()).toContainText('completed');
 await expect(rows.last()).toContainText('denied');
 const rowText=await rows.allTextContents();expect(rowText.join(' ')).not.toContain('a.md');expect(rowText.join(' ')).not.toContain('b.md');
 if(process.env.SOMNIA_SHOTS)await page.screenshot({path:`${process.env.SOMNIA_SHOTS}/mcp-activity.png`});
});

test('mcp consent dialog offers three answers; allow for this session creates a visible grant that revokes',async({page})=>{
 const digest='c'.repeat(64);
 await page.addInitScript(()=>{
  const w=window as any;w.isTauri=true;let next=0;w.ipcCalls=[];let running=false;let grants:any[]=[];
  const d='c'.repeat(64);
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++next,invoke:async(cmd:string,args:any)=>{
   w.ipcCalls.push({cmd,args});if(cmd==='plugin:event|listen')return ++next;
   if(cmd==='mcp_servers_list')return [{config:{id:'files',command:'/usr/bin/my-mcp',args:[],env:{}},running}];
   if(cmd==='mcp_server_start'){running=true;return [{server:'files',name:'read_note',description:'Reads a note',input_schema:{type:'object',properties:{path:{type:'string'}}},schema_digest:d}];}
   if(cmd==='mcp_grants_list')return {shell:[],network:[],mcp:grants};
   if(cmd==='mcp_tool_call'){if(args.choice==='allow_for_run')grants=[{grantId:'g-1',server:'files',tool:'read_note',schemaDigest:d}];else if(!args.choice&&!grants.length)throw 'mcp_consent_required';return 'ran';}
   if(cmd==='mcp_grant_revoke'){grants=[];return 1;}
   return null;
  }};w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 });
 const s=await openMcpSettings(page);
 await s.getByRole('button',{name:'Start'}).click();
 await s.getByRole('checkbox',{name:/read_note/}).check();
 const kick=async(slot:string)=>page.evaluate(async(slot)=>{
  const m=await import('/src/lib/agent/mcpRuntime.ts');const t=await import('/src/lib/agent/mcpTools.ts');
  const r=t.createMcpRegistry();const name=m.getMcpRuntime()!.register(r)[0];
  const ctx={files:()=>({}),propose:async()=>{}} as any;const g={levels:['read','propose','execute']} as any;
  (window as any)[slot]=r.run(name,{path:'a.md'},ctx,new AbortController().signal,g).then((v:any)=>({v})).catch((e:any)=>({err:String((e as Error).message||e)}));
 },slot);
 await kick('run1');
 const dlg=page.getByRole('alertdialog');await expect(dlg).toBeVisible();
 await expect(page.getByTestId('mcp-deny')).toBeVisible();await expect(page.getByTestId('mcp-allow')).toBeVisible();await expect(page.getByTestId('mcp-allow-run')).toBeVisible();
 if(process.env.SOMNIA_SHOTS)await page.screenshot({path:`${process.env.SOMNIA_SHOTS}/mcp-consent-three-options.png`});
 await page.getByTestId('mcp-allow-run').click();
 expect((await page.evaluate(()=>(window as any).run1)).v).toContain('untrusted');
 const first=await page.evaluate(()=>(window as any).ipcCalls.filter((c:any)=>c.cmd==='mcp_tool_call').map((c:any)=>c.args.choice));
 expect(first).toEqual(['allow_for_run']);
 // The grant shows in the grants view; the same tool definition no longer asks.
 await page.evaluate(async()=>{const m=await import('/src/store/appStore.ts');m.patchState({settingsOpen:true,settingsSection:'AI',settingsAITab:'tools'});});
 const rows=page.getByTestId('mcp-grant-row');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('files/read_note');
 if(process.env.SOMNIA_SHOTS)await page.screenshot({path:`${process.env.SOMNIA_SHOTS}/mcp-grants-view.png`});
 await kick('run2');
 expect((await page.evaluate(()=>(window as any).run2)).v).toContain('untrusted');
 await expect(page.getByRole('alertdialog')).toHaveCount(0);
 const second=await page.evaluate(()=>(window as any).ipcCalls.filter((c:any)=>c.cmd==='mcp_tool_call').map((c:any)=>c.args.choice));
 expect(second).toEqual(['allow_for_run',undefined]);
 // Revoke from the grants view: it asks again.
 await page.getByTestId('mcp-grant-revoke').click();
 await expect(rows).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).ipcCalls.some((c:any)=>c.cmd==='mcp_grant_revoke'&&c.args.kind==='mcp'&&c.args.grantId==='g-1'))).toBe(true);
 await kick('run3');
 await expect(page.getByRole('alertdialog')).toBeVisible();
 await page.getByTestId('mcp-deny').click();
 expect((await page.evaluate(()=>(window as any).run3)).err).toContain('did not approve');
 void digest;
});
