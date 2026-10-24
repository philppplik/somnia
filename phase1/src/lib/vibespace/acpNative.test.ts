import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {acpCommands,createAcpClient,parseAcpState,ACP_CHANNEL} from './acpNative';

function fakeIo(replies:Record<string,unknown>){
 const calls:{command:string;args?:Record<string,unknown>}[]=[];let handler:((e:{payload:unknown})=>void)|null=null;
 return{calls,emit:(p:unknown)=>handler?.({payload:p}),io:{invoke:async(command:string,args?:Record<string,unknown>)=>{calls.push({command,args});return replies[command];},
  listen:async(channel:string,h:(e:{payload:unknown})=>void)=>{assert.equal(channel,ACP_CHANNEL);handler=h;return()=>{handler=null;};}}};
}

test('every acp command name exists in the generated command table and in build.rs/capabilities',()=>{
 const names=readFileSync('src/generated/commandNames.ts','utf8');const build=readFileSync('src-tauri/build.rs','utf8');const cap=readFileSync('src-tauri/capabilities/editor.json','utf8');
 const desktop=readFileSync('src-tauri/src/desktop.rs','utf8');
 for(const c of Object.values(acpCommands)){
  assert.ok(names.includes(`'${c}'`),`${c} generated`);assert.ok(build.includes(`"${c}"`),`${c} build.rs`);
  assert.ok(cap.includes(`"allow-${c.replaceAll('_','-')}"`),`${c} capability`);assert.ok(desktop.includes(`crate::vibespace_acp_commands::${c},`),`${c} invoke_handler`);
 }
});

test('commands send one strict request object and parse replies',async()=>{
 const f=fakeIo({vibespace_acp_launch:{sessionKey:'acp-1',runId:'acp-1'},vibespace_acp_session:'sess-1',vibespace_acp_prompt:'end_turn'});
 const c=createAcpClient(f.io);
 assert.deepEqual(await c.launch({name:'Claude Code',program:'claude'}),{sessionKey:'acp-1',runId:'acp-1'});
 assert.equal(await c.openSession('acp-1',true),'sess-1');assert.equal(await c.prompt('acp-1','hi'),'end_turn');
 await c.decideConsent('acp-1','prop-1','deny');await c.cancel('acp-1',{close:true});
 assert.deepEqual(f.calls.map(x=>x.command),['vibespace_acp_launch','vibespace_acp_session','vibespace_acp_prompt','vibespace_acp_decide_consent','vibespace_acp_cancel']);
 assert.deepEqual(f.calls[0].args,{request:{name:'Claude Code',program:'claude',args:[]}});
 assert.deepEqual(f.calls[3].args,{request:{sessionKey:'acp-1',requestId:'prop-1',choice:'deny'}});
 assert.deepEqual(f.calls[4].args,{request:{sessionKey:'acp-1',graceMs:0,close:true}});
});

test('launch rejects a malformed native reply instead of guessing',async()=>{
 await assert.rejects(createAcpClient(fakeIo({vibespace_acp_launch:{}}).io).launch({name:'a',program:'b'}),/acp_launch_invalid/);
});

test('state shows consent origin, offered choices and the transcript from the event log',()=>{
 const s=parseAcpState({status:'ready',failure:null,runId:'acp-1',name:'Fake Agent',lastSessionId:'s1',
  pending:[{requestId:'prop-9',kind:'write',target:'a.txt',reason:'Fake Agent asks: edit',offered:['deny','allow_once'],origin:{type:'external_agent',name:'Fake Agent'}}],
  events:[{kind:'lifecycle',data:{event:'launched'}},{kind:'permission',data:{decision:'denied',kind:'write',title:'edit'}},{kind:'update',data:{}}]});
 assert.equal(s.pending[0].origin?.key,'vibespace.acp.origin');assert.equal(s.pending[0].allowForRun,false);
 assert.deepEqual(s.transcript.map(l=>l.key),['vibespace.acp.launched','vibespace.acp.perm.denied']);
 assert.equal(s.lastSessionId,'s1');
});

test('state parse rejects unknown status; failed carries the fixed code',()=>{
 assert.throws(()=>parseAcpState({status:'weird'}),/acp_state_invalid/);assert.throws(()=>parseAcpState(null),/acp_state_invalid/);
 assert.equal(parseAcpState({status:'failed',failure:'vibespace_acp_isolation_unavailable'}).failure,'vibespace_acp_isolation_unavailable');
});

test('change notifications reach the handler with the session key',async()=>{
 const f=fakeIo({});const seen:string[]=[];const off=await createAcpClient(f.io).onChanged((k,r)=>seen.push(`${k}:${r}`));
 f.emit({sessionKey:'acp-1',reason:'changed'});f.emit({nope:1});f.emit(null);assert.deepEqual(seen,['acp-1:changed']);await off();
});
