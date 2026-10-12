import {test,expect} from './fixtures';

// Browser-side production wiring, with the desktop HTTP/IPC boundary mocked.
// The real loopback socket and auth guards are covered by cargo test mcp_.
test('studio MCP starts off, forwards Tauri payloads, stops and rotates its token',async({page})=>{
 await page.addInitScript(()=>{
  const w=window as any;w.isTauri=true;
  const callbacks=new Map<number,(event:unknown)=>unknown>();
  const listeners=new Map<string,number>();
  let seq=0,running=false,generation=0;
  w.mcpResponses=[];w.mcpStarts=0;
  w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},
   transformCallback:(cb:(event:unknown)=>unknown)=>{callbacks.set(++seq,cb);return seq;},
   invoke:async(cmd:string,args:any)=>{
    if(cmd==='plugin:event|listen'){listeners.set(args.event,args.handler);return ++seq;}
    if(cmd==='mcp_servers_list')return [];
    if(cmd==='mcp_grants_list')return {shell:[],network:[],mcp:[]};
    if(cmd==='studio_mcp_start'){running=true;generation++;w.mcpStarts++;}
    if(cmd==='studio_mcp_stop'){running=false;return null;}
    if(cmd==='studio_mcp_status'||cmd==='studio_mcp_start')return {running,port:running?4310:0,token:running?`session-${generation}`:''};
    if(cmd==='studio_mcp_respond'){w.mcpResponses.push(args);return null;}
    return null;
   }};
  w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
  // Envelope id is deliberately different from the Rust correlation id in payload.
  w.fireStudioMcp=(id:number,message:unknown)=>callbacks.get(listeners.get('somnia://studio-mcp')!)!({
   event:'somnia://studio-mcp',id:9000+id,payload:{id,message:typeof message==='string'?message:JSON.stringify(message)}});
 });
 await page.goto('/');
 await expect.poll(()=>page.evaluate(async()=>Boolean((await import('/src/lib/agent/studioMcpHost.ts')).getStudioMcpHost())),{timeout:15000}).toBe(true);
 await page.evaluate(async()=>{const m=await import('/src/store/appStore.ts');m.patchState({settingsOpen:true,settingsSection:'AI',settingsAITab:'tools',activeStudio:'code',activeFile:'index.html'});});
 const server=page.getByTestId('mcp-server-section');
 await expect(server.getByTestId('mcp-server-start')).toBeVisible();
 expect(await page.evaluate(()=>(window as any).mcpStarts)).toBe(0);
 await server.getByTestId('mcp-server-start').click();
 await expect(server.getByTestId('mcp-server-url')).toHaveValue('http://127.0.0.1:4310/mcp');
 await expect(server.getByTestId('mcp-server-token')).toHaveValue('session-1');
 const rpc=async(id:number,message:unknown)=>{
  await page.evaluate(({id,message})=>(window as any).fireStudioMcp(id,message),{id,message});
  await expect.poll(()=>page.evaluate(id=>(window as any).mcpResponses.some((r:any)=>r.id===id),id)).toBe(true);
  return page.evaluate(id=>{const r=(window as any).mcpResponses.find((r:any)=>r.id===id);return r.response===null?null:JSON.parse(r.response);},id);
 };
 const init=await rpc(41,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}});
 expect(init.id).toBe(1);expect(init.result.serverInfo.name).toBe('somnia');
 const list=await rpc(42,{jsonrpc:'2.0',id:2,method:'tools/list'});
 expect(list.id).toBe(2);expect(Array.isArray(list.result.tools)).toBe(true);
 expect(list.result.tools.some((t:any)=>t.name==='dom_inspect')).toBe(true);
 const read=await rpc(46,{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'dom_inspect',arguments:{}}});
 expect(read.result.isError).toBe(false);
 const denied=await rpc(47,{jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'execute',arguments:{}}});
 expect(denied.error.code).toBe(-32602);
 expect(await rpc(43,{jsonrpc:'2.0',method:'notifications/initialized'})).toBeNull();
 const invalid=await rpc(44,'not json');expect(invalid.error.code).toBe(-32700);
 await server.getByTestId('mcp-server-stop').click();
 await expect(server.getByTestId('mcp-server-start')).toBeVisible();
 await expect(server.getByTestId('mcp-server-token')).toHaveCount(0);
 const off=await rpc(45,{jsonrpc:'2.0',id:3,method:'tools/list'});expect(off.error.message).toContain('turned off');
 await server.getByTestId('mcp-server-start').click();
 await expect(server.getByTestId('mcp-server-token')).toHaveValue('session-2');
 await server.getByTestId('mcp-server-stop').click();
});
