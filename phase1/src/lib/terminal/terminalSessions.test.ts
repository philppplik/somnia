import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerminalSessionsStore,runEntry,RUN_PREFIX,type TerminalNativePort} from './terminalSessions';
import type {TerminalInfo} from './nativeTerminal';
import type {FrameworkSession} from '../frameworks/session';

function mockFramework(initial:Partial<FrameworkSession>={}){
 let snapshot:FrameworkSession={projectId:'p',state:'idle',logs:[],...initial};
 const listeners=new Set<()=>void>();
 return {
  getSnapshot:()=>snapshot,
  subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
  emit(patch:Partial<FrameworkSession>){snapshot={...snapshot,...patch};listeners.forEach(fn=>fn());},
 };
}
function mockPort():TerminalNativePort&{killed:string[]}{
 const killed:string[]=[];let next=0;
 return {killed,
  async spawn(cwd,_cols,_rows):Promise<TerminalInfo>{next++;return {sessionId:`pty-${next}`,shell:'bash',cwd:cwd??'/x',pid:100+next,alive:true,exitCode:null};},
  async list():Promise<TerminalInfo[]>{return [{sessionId:'pty-old',shell:'pwsh',cwd:'/x',pid:9,alive:true,exitCode:null}];},
  async kill(id:string){killed.push(id);},
 };
}

test('runEntry maps the framework runner to a read-only stream entry',()=>{
 assert.equal(runEntry({projectId:'p',state:'idle',logs:[]},null),null);
 const installing=runEntry({projectId:'p',state:'installing',logs:[],handle:{id:'r1',projectId:'p',kind:'install',state:'running'}},null);
 assert.equal(installing?.id,RUN_PREFIX+'r1');
 assert.equal(installing?.titleKey,'terminal.run.install');
 assert.equal(installing?.readOnly,true);
 assert.equal(installing?.alive,true);
 const dev=runEntry({projectId:'p',state:'running',logs:[],handle:{id:'r2',projectId:'p',kind:'dev',state:'running'}},null);
 assert.equal(dev?.titleKey,'terminal.run.dev');
 // Finished runs stay listed as long as their logs are visible.
 const done=runEntry({projectId:'p',state:'failed',logs:[{stream:'stderr',line:'boom'}],handle:{id:'r3',projectId:'p',kind:'build',state:'exited',exitCode:1}},null);
 assert.equal(done?.alive,false);
 assert.equal(done?.exitCode,1);
 assert.equal(done?.titleKey,'terminal.run.build');
});

test('spawn adds a shell entry and selects it; kill removes and falls back',async()=>{
 const store=createTerminalSessionsStore(mockPort(),mockFramework(),{nativeAvailable:true});
 const a=await store.spawn(null,80,24);
 const b=await store.spawn('/proj',120,30);
 assert.deepEqual(store.getSnapshot().entries.map(e=>e.id),[a,b]);
 assert.equal(store.getSnapshot().activeId,b);
 await store.kill(b!);
 assert.deepEqual(store.getSnapshot().entries.map(e=>e.id),[a]);
 assert.equal(store.getSnapshot().activeId,a);
});

test('kill forwards shell sessions to the native port',async()=>{
 const port=mockPort();
 const store=createTerminalSessionsStore(port,mockFramework(),{nativeAvailable:true});
 const a=await store.spawn();
 await store.kill(a!);
 assert.deepEqual(port.killed,[a]);
});

test('run entry appears when the framework session starts and merges with shells',async()=>{
 const fw=mockFramework();
 const store=createTerminalSessionsStore(mockPort(),fw,{nativeAvailable:true});
 const shell=await store.spawn();
 assert.deepEqual(store.getSnapshot().entries.map(e=>e.id),[shell]);
 fw.emit({state:'installing',handle:{id:'run-9',projectId:'p',kind:'install',state:'running'}});
 const entries=store.getSnapshot().entries;
 assert.deepEqual(entries.map(e=>e.id),[RUN_PREFIX+'run-9',shell]);
 // The active shell selection survives the run entry appearing.
 assert.equal(store.getSnapshot().activeId,shell);
 assert.equal(entries[0].unread,true);
});

test('unread flag clears on select; handleExit marks the session dead',async()=>{
 const store=createTerminalSessionsStore(mockPort(),mockFramework(),{nativeAvailable:true});
 const a=await store.spawn();
 const b=await store.spawn();
 store.select(a);
 store.markUnread(b!);
 assert.equal(store.getSnapshot().entries.find(e=>e.id===b)?.unread,true);
 store.select(b);
 assert.equal(store.getSnapshot().entries.find(e=>e.id===b)?.unread,false);
 store.handleExit(b!,-1);
 const dead=store.getSnapshot().entries.find(e=>e.id===b);
 assert.equal(dead?.alive,false);
 assert.equal(dead?.exitCode,-1);
});

test('reconnect adopts native sessions that outlived the renderer',async()=>{
 const store=createTerminalSessionsStore(mockPort(),mockFramework(),{nativeAvailable:true});
 await store.reconnect();
 assert.deepEqual(store.getSnapshot().entries.map(e=>e.id),['pty-old']);
 assert.equal(store.getSnapshot().activeId,'pty-old');
 // Reconnecting again does not duplicate.
 await store.reconnect();
 assert.equal(store.getSnapshot().entries.length,1);
});

test('run entry disappears when the framework session resets with no logs',async()=>{
 const fw=mockFramework({state:'running',handle:{id:'r1',projectId:'p',kind:'dev',state:'running'}});
 const store=createTerminalSessionsStore(mockPort(),fw,{nativeAvailable:true});
 assert.equal(store.getSnapshot().entries.length,1);
 fw.emit({state:'idle',handle:undefined,logs:[]});
 assert.equal(store.getSnapshot().entries.length,0);
 assert.equal(store.getSnapshot().activeId,null);
});
