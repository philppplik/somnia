import test from 'node:test';
import assert from 'node:assert/strict';
import {AcpPanelStore,ACP_LIMITS,promptLength} from './acpPanelState';
import {createAcpClient,parseAcpState} from './acpNative';
import {VIBESPACE_CATALOGUES} from './i18n';
const state={status:'ready',runId:'acp-1',name:'a',pending:[],events:[],lastSessionId:null};
test('Unicode prompt count matches native character limit and locale keys have parity',()=>{
 assert.equal(promptLength('a😀'),2);assert.equal(ACP_LIMITS.prompt,100_000);
 const keys=Object.keys(VIBESPACE_CATALOGUES.en).filter(k=>k.startsWith('vibespace.acp.ui.')).sort();
 assert.ok(keys.length>30);
 for(const cat of Object.values(VIBESPACE_CATALOGUES))assert.deepEqual(Object.keys(cat).filter(k=>k.startsWith('vibespace.acp.ui.')).sort(),keys);
});
test('offered choices fail closed; native event count is independent of presentation lines',()=>{
 const parsed=parseAcpState({...state,pending:[{requestId:'p',kind:'write',offered:['deny']}],events:[{kind:'update',data:{}}]});
 assert.equal(parsed.pending[0].allowOnce,false);assert.equal(parsed.pending[0].allowForRun,false);assert.equal(parsed.eventCount,1);assert.equal(parsed.transcript.length,0);
});
test('native handles survive dock subscribers, failed reads retain state but mark it unverified',async()=>{
 let fail=false;const client=createAcpClient({listen:async()=>()=>{},invoke:async cmd=>{
  if(cmd==='vibespace_acp_launch')return{sessionKey:'acp-1',runId:'acp-1'};
  if(fail)throw new Error('offline');return state;
 }});const store=new AcpPanelStore(client);let n=0;const off=store.subscribe(()=>n++);
 await store.launch('a','/bin/a',[]);assert.equal(store.snapshot()[0].state?.status,'ready');off();
 fail=true;await store.refresh('acp-1');assert.equal(store.snapshot()[0].readFailed,true);assert.ok(n>0);
 fail=false;await store.refresh('acp-1');assert.equal(store.snapshot()[0].readFailed,false);assert.equal(store.snapshot().length,1);
});
test('consent and cancellation can run while a prompt awaits permission; duplicate turns cannot',async()=>{
 const client=createAcpClient({listen:async()=>()=>{},invoke:async cmd=>cmd==='vibespace_acp_launch'?{sessionKey:'acp-1',runId:'acp-1'}:state});
 const store=new AcpPanelStore(client);await store.launch('a','/bin/a',[]);
 let done!:()=>void;const turn=store.action('acp-1',()=>new Promise<void>(resolve=>{done=resolve;}),true);
 await assert.rejects(store.action('acp-1',async()=>{},true),/busy/);
 let decided=false;await store.action('acp-1',async()=>{decided=true;});assert.ok(decided);assert.ok(store.snapshot()[0].turn);
 done();await turn;assert.equal(store.snapshot()[0].turn,false);
});
