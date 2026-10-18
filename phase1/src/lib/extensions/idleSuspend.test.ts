import test from 'node:test';
import assert from 'node:assert/strict';
import {ExtensionIdleSuspender,DEFAULT_HOST_BYTES,type SuspendableHost} from './idleSuspend';
import type {PressureLevel} from '../lifecycle/manager';

const MiB=1024*1024;
function rig(extra:{budget?:number;pressure?:PressureLevel;enabled?:boolean}={}){
 let t=1_000_000;const created:string[]=[];const disposed:string[]=[];const changes:string[]=[];
 let pressure:PressureLevel=extra.pressure??'normal';let enabled=extra.enabled??true;
 let hold=false;const pending:Array<()=>void>=[];
 const s=new ExtensionIdleSuspender<SuspendableHost&{id:string}>({
  create:id=>{created.push(id);return{id,runCommand:()=>new Promise<void>(r=>{if(hold)pending.push(r);else r();}),dispose:()=>{disposed.push(id);}};},
  budgetBytes:()=>extra.budget??64*MiB,now:()=>t,idleMs:300_000,pressureIdleMs:60_000,minResidentMs:10_000,
  pressure:()=>pressure,isEnabled:()=>enabled,onChange:(id,st,why)=>changes.push(`${id}:${st}:${why}`),
 });
 return{s,created,disposed,changes,advance:(ms:number)=>{t+=ms;},setPressure:(p:PressureLevel)=>{pressure=p;},setEnabled:(b:boolean)=>{enabled=b;},hold:()=>{hold=true;},release:()=>{pending.splice(0).forEach(f=>f());}};
}

test('idle host is suspended after idleMs and not before',()=>{
 const r=rig();r.s.register('a');
 r.advance(299_000);assert.deepEqual(r.s.tick(),[]);assert.equal(r.s.state('a'),'active');
 r.advance(1_000);assert.deepEqual(r.s.tick(),['a']);assert.equal(r.s.state('a'),'suspended');
 assert.deepEqual(r.disposed,['a']);assert.equal(r.s.suspensions('a'),1);
});
test('running a command on a suspended host resumes it on demand',async()=>{
 const r=rig();r.s.register('a');r.advance(300_000);r.s.tick();
 await r.s.run('a','cmd');
 assert.equal(r.s.state('a'),'active');assert.deepEqual(r.created,['a','a']);
 assert.ok(r.changes.includes('a:active:command'));
});
test('a command in flight pins the host',async()=>{
 const r=rig();r.s.register('a');r.hold();
 const p=r.s.run('a','slow');r.advance(900_000);
 assert.deepEqual(r.s.tick(),[]);assert.equal(r.s.state('a'),'active');
 r.release();await p;r.advance(300_000);assert.deepEqual(r.s.tick(),['a']);
});
test('activity resets the idle timer',async()=>{
 const r=rig();r.s.register('a');r.advance(250_000);await r.s.run('a','c');
 r.advance(250_000);assert.deepEqual(r.s.tick(),[]);r.advance(60_000);assert.deepEqual(r.s.tick(),['a']);
});
test('pressure shortens the idle window',()=>{
 const r=rig();r.s.register('a');r.advance(61_000);assert.deepEqual(r.s.tick(),[]);
 r.setPressure('critical');assert.deepEqual(r.s.tick(),['a']);assert.ok(r.changes.includes('a:suspended:idle-pressure'));
});
test('minimum resident time protects a host that just started',()=>{
 const r=rig({budget:0});r.s.register('a');r.advance(5_000);assert.deepEqual(r.s.tick(),[]);
 r.advance(5_000);assert.deepEqual(r.s.tick(),['a']);
});
test('over budget suspends least recently used hosts first, keeps the newest',async()=>{
 const r=rig({budget:2*DEFAULT_HOST_BYTES});['a','b','c'].forEach(i=>r.s.register(i));
 r.advance(20_000);await r.s.run('b','c');r.advance(1_000);await r.s.run('c','c');
 const out=r.s.tick();
 assert.equal(out.length,1);assert.equal(out[0],'a');assert.equal(r.s.residentBytes(),2*DEFAULT_HOST_BYTES);
});
test('disabled lifecycle never suspends',()=>{
 const r=rig({enabled:false});r.s.register('a');r.advance(900_000);assert.deepEqual(r.s.tick(),[]);
 r.setEnabled(true);assert.deepEqual(r.s.tick(),['a']);
});
test('touch resumes a suspended host; unknown ids are rejected; dispose clears hosts',async()=>{
 const r=rig();r.s.register('a');r.advance(300_000);r.s.tick();r.s.touch('a');assert.equal(r.s.state('a'),'active');
 await assert.rejects(()=>r.s.run('zzz','c'),/Unknown extension/);
 r.s.dispose();assert.equal(r.s.state('a'),undefined);assert.equal(r.disposed.at(-1),'a');
});
