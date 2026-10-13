import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeProjectRunner} from './runner';
import {commandDispatcher} from '../commandDispatcher';
test('framework execution rejects agent and MCP origins before native IPC',async()=>{
 for(const origin of ['agent','mcp'] as const) await assert.rejects(commandDispatcher.runCommand('frameworks.run',{projectId:'opaque',kind:'build'},{origin}), /not allowed|forbidden|cannot|not permitted/i);
});
test('logs are incremental and stop polling on exit',async()=>{
 let logs=0;const lines:string[]=[];
 const runner=new NativeProjectRunner(async <T>(name:string,args?:Record<string,unknown>)=>{
  if(name==='project_status') return {state:'exited'} as T;
  assert.equal(name,'project_logs');logs++;
  if(logs===1){assert.equal(args?.afterSequence,0);return {lines:[{sequence:1,stream:'stdout',text:'hello'}],nextSequence:1} as T;}
  assert.equal(args?.afterSequence,1);return {lines:[{sequence:2,stream:'stderr',text:'done'}],nextSequence:2} as T;
 },5);
 runner.onLog('id',line=>lines.push(line.text));await new Promise(r=>setTimeout(r,40));assert.deepEqual(lines,['hello','done']);assert.equal(logs,2);
});
test('unsubscribe ignores in-flight log response',async()=>{
 const runner=new NativeProjectRunner(async <T>()=>{await new Promise(r=>setTimeout(r,15));return {lines:[{sequence:1,stream:'stdout',text:'ignored'}],nextSequence:1} as T;});
 const lines:string[]=[];const off=runner.onLog('id',line=>lines.push(line.text));off();await new Promise(r=>setTimeout(r,40));assert.deepEqual(lines,[]);
});
test('framework catalogue keys are present in all five languages',async()=>{
 const {CATALOGUES}=await import('../i18n');const keys=Object.keys(CATALOGUES.en).filter(k=>k.startsWith('frameworks.'));
 assert.ok(keys.length>30);for(const [locale,cat]of Object.entries(CATALOGUES))for(const key of keys)assert.ok(cat[key],`${locale}: ${key}`);
});
test('palette cannot download the runtime without explicit consent',async()=>{
 await assert.rejects(commandDispatcher.runCommand('frameworks.installHelper',{}, {origin:'palette'}));
 await assert.rejects(commandDispatcher.runCommand('frameworks.installHelper',{consent:false}, {origin:'palette'}));
});
