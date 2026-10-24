import {test} from 'node:test';import assert from 'node:assert/strict';
import {createStaticBuilder,artifactError,type StaticArtifactSummary} from './staticBuild';
import type {ProjectRunner,RunnerHandle,RunKind,RunnerLog} from './runnerContract';
const summary:StaticArtifactSummary={framework:'react',dist:'dist',fileCount:1,totalBytes:3,spaRules:null,manifest:{kind:'static',buildId:'a'.repeat(32),files:[{path:'index.html',sha256:'b'.repeat(64),size:3,mode:0o644}]}};
function fakeRunner(script:{exit?:number;lines?:string[];ticks?:number}={}){
 const calls:string[]=[];const stopped:string[]=[];const handles=new Map<string,RunnerHandle&{polls:number}>();let n=0;const listeners=new Map<string,(l:RunnerLog)=>void>();
 const runner:ProjectRunner={
  async start(projectId,kind:RunKind){calls.push(kind);const id=`r${++n}`;const h={id,projectId,kind,state:'running' as const,polls:0};handles.set(id,h);return {...h};},
  async stop(id){stopped.push(id);const h=handles.get(id);if(h)h.state='stopped';},
  async status(id){const h=handles.get(id)!;h.polls++;if(h.state==='running'&&h.polls>(script.ticks??1)){h.state='exited';(h as RunnerHandle).exitCode=script.exit??0;}return {...h};},
  onLog(id,fn){listeners.set(id,fn);for(const l of script.lines??[])fn({stream:'stdout',line:l});return()=>{listeners.delete(id);};}};
 return {runner,calls,stopped};
}
test('successful build collects once and exposes the summary',async()=>{
 const f=fakeRunner({lines:['building']});const seen:string[]=[];
 const b=createStaticBuilder(f.runner,async id=>{seen.push(id);return summary;},{pollMs:1});
 await b.run('p1');const s=b.getSnapshot();
 assert.equal(s.phase,'done');assert.deepEqual(f.calls,['build']);assert.deepEqual(seen,['r1']);assert.equal(s.summary?.manifest.kind,'static');assert.equal(s.logs[0].line,'building');
});
test('install runs first when asked',async()=>{
 const f=fakeRunner();const b=createStaticBuilder(f.runner,async()=>summary,{pollMs:1});await b.run('p',true);
 assert.deepEqual(f.calls,['install','build']);assert.equal(b.getSnapshot().phase,'done');
});
test('failed build never collects and keeps no manifest',async()=>{
 const f=fakeRunner({exit:1});let collected=0;const b=createStaticBuilder(f.runner,async()=>{collected++;return summary;},{pollMs:1});
 await b.run('p');const s=b.getSnapshot();assert.equal(s.phase,'failed');assert.equal(s.errorKey,'frameworks.build.failed');assert.equal(collected,0);assert.equal(s.summary,undefined);
});
test('failed install stops before build',async()=>{
 const f=fakeRunner({exit:1});const b=createStaticBuilder(f.runner,async()=>summary,{pollMs:1});await b.run('p',true);
 assert.deepEqual(f.calls,['install']);assert.equal(b.getSnapshot().phase,'failed');
});
test('collector errors map to catalogue keys, with a safe relative path only',async()=>{
 const mk=(msg:string)=>{const f=fakeRunner();const b=createStaticBuilder(f.runner,async()=>{throw msg;},{pollMs:1});return b.run('p').then(()=>b.getSnapshot());};
 let s=await mk('frameworks.artifact.notStatic');assert.equal(s.errorKey,'frameworks.artifact.notStatic');
 s=await mk('frameworks.artifact.forbidden:.env.production');assert.deepEqual([s.errorKey,s.errorPath],['frameworks.artifact.forbidden','.env.production']);
 s=await mk('frameworks.artifact.link:../../etc/passwd');assert.equal(s.errorPath,undefined);
 s=await mk('/home/user/secret path leaked');assert.equal(s.errorKey,'frameworks.build.failed');assert.equal(s.errorPath,undefined);
 assert.deepEqual(artifactError(new Error('frameworks.artifact.bogus')),{key:'frameworks.build.failed'});
});
test('logs are redacted and bounded',async()=>{
 const lines=Array.from({length:700},(_,i)=>i===0?'token=SECRET123':`l${i}`);const f=fakeRunner({lines});
 const b=createStaticBuilder(f.runner,async()=>summary,{pollMs:1,redact:s=>s.replace('SECRET123','***')});await b.run('p');
 const logs=b.getSnapshot().logs;assert.equal(logs.length,500);assert.ok(!logs.some(l=>l.line.includes('SECRET')));
 const g=fakeRunner({lines:['token=SECRET123']});const c=createStaticBuilder(g.runner,async()=>summary,{pollMs:1,redact:s=>s.replace('SECRET123','***')});await c.run('p');assert.equal(c.getSnapshot().logs[0].line,'token=***');
});
test('cancel stops the run and discards results',async()=>{
 const f=fakeRunner({ticks:1000});const b=createStaticBuilder(f.runner,async()=>summary,{pollMs:2});
 const running=b.run('p');await new Promise(r=>setTimeout(r,20));await b.cancel();await running;
 assert.deepEqual(f.stopped,['r1']);assert.equal(b.getSnapshot().phase,'idle');assert.equal(b.getSnapshot().summary,undefined);
});
test('timeout stops the run',async()=>{
 const f=fakeRunner({ticks:100000});const b=createStaticBuilder(f.runner,async()=>summary,{pollMs:2,timeoutMs:20});await b.run('p');
 assert.equal(b.getSnapshot().errorKey,'frameworks.build.timeout');assert.deepEqual(f.stopped,['r1']);
});
test('a second run supersedes the first without leaking its result',async()=>{
 const f=fakeRunner({ticks:3});const b=createStaticBuilder(f.runner,async()=>summary,{pollMs:2});
 const a=b.run('one');await new Promise(r=>setTimeout(r,3));const c=b.run('two');await Promise.all([a,c]);
 assert.equal(b.getSnapshot().projectId,'two');assert.equal(b.getSnapshot().phase,'done');
});
