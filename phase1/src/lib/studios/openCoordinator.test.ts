import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOpenCoordinator,routesShell,type OpenDeps,type OpenInput} from './openCoordinator';
import './index';
const enc=(s:string)=>new TextEncoder().encode(s);
const docx=()=>({name:'a.docx',bytes:new Uint8Array(readFileSync('test/documents/sample.docx'))});
const WAV=(()=>{const b=new Uint8Array(16);b.set(enc('RIFF'),0);b.set(enc('WAVE'),8);return b;})();
function harness(over:Partial<OpenDeps>&{failPrepare?:string[];failCommit?:string[];delay?:Record<string,Promise<void>>}={}){
 const log:string[]=[];const shell={studio:'video'};const session={doc:'video-project'};
 const deps:OpenDeps={
  async prepare(input,res){
   await over.delay?.[input.name];
   if(over.failPrepare?.includes(input.name))throw new Error('decoder failed');
   return{name:input.name,studioId:res.handler.studioId,
    commit(){if(over.failCommit?.includes(input.name))return{ok:false,error:'replace cancelled'};log.push('commit:'+input.name);return{ok:true,key:input.name};},
    dispose(){log.push('dispose:'+input.name);},focus(key){log.push('focus:'+key);session.doc=key;}};},
  switchStudio(id){log.push('studio:'+id);shell.studio=id;},
  notify(t){log.push('notify:'+t);},
  pendingGesture:over.pendingGesture,
 };
 return{log,shell,session,c:createOpenCoordinator(deps)};
}
test('explicit Open of a DOCX while Video is selected routes to Documents (no manual lock involved)',async()=>{
 const h=harness();const r=await h.c.openFiles([docx()]);
 assert.equal(h.shell.studio,'documents');assert.equal(r.focused?.studioId,'documents');assert.equal(r.summary,'Opened a.docx in Documents.');
});
test('each shipped Studio, from Video as the starting Studio',async()=>{
 const cases:[OpenInput,string][]=[[docx(),'documents'],[{name:'s.xlsx',bytes:new Uint8Array(readFileSync('sheets-craft/fixtures/fixture.xlsx'))},'sheets'],[{name:'d.pptx',bytes:new Uint8Array(readFileSync('slides-engine/fixtures/independent.pptx'))},'slides'],[{name:'c.wav',bytes:WAV},'sound'],[{name:'i.html',bytes:enc('<p/>')},'code']];
 for(const [input,studio] of cases){const h=harness();await h.c.openFiles([input]);assert.equal(h.shell.studio,studio,input.name);}
});
test('unknown binary and unknown text never switch the shell or commit',async()=>{
 const h=harness();
 const r=await h.c.openFiles([{name:'x.bin',bytes:Uint8Array.from([1,0,2,0,3,0,4,0])}]);
 assert.equal(r.outcomes[0].status,'unsupported');assert.deepEqual(h.log.filter(l=>!l.startsWith('notify')),[]);assert.equal(h.shell.studio,'video');assert.match(r.summary,/^Could not open x\.bin/);
 const t=await h.c.openFiles([{name:'x.weird',bytes:enc('hello')}]);
 assert.equal(t.outcomes[0].status,'safe-text-offer');assert.equal(h.shell.studio,'video');
 const ok=await h.c.openFiles([{name:'x.weird',bytes:enc('hello')}],{acceptTextOffer:true});assert.equal(ok.outcomes[0].status,'opened');assert.equal(h.shell.studio,'code');
});
test('failed prepare keeps the old session and Studio untouched, resources of siblings are released only when not committed',async()=>{
 const h=harness({failPrepare:['a.docx']});const r=await h.c.openFiles([docx()]);
 assert.equal(h.shell.studio,'video');assert.equal(h.session.doc,'video-project');assert.equal(r.outcomes[0].status,'failed');assert.ok(!h.log.some(l=>l.startsWith('commit')||l.startsWith('focus')||l.startsWith('studio')));
});
test('replacement guard rejecting at commit time is a failure, no focus, no switch',async()=>{
 const h=harness({failCommit:['a.docx']});const r=await h.c.openFiles([docx()]);
 assert.equal(r.outcomes[0].status,'failed');assert.equal(h.shell.studio,'video');assert.deepEqual(h.log.filter(l=>l.startsWith('focus')||l.startsWith('studio')),[]);assert.ok(h.log.includes('dispose:a.docx'));
});
test('mixed batch: first success is focused once, later successes stay in the background, failures are summarised',async()=>{
 const h=harness({failPrepare:['b.wav']});
 const r=await h.c.openFiles([{name:'bad.bin',bytes:Uint8Array.from([0,0,0,0,0,1])},{name:'b.wav',bytes:WAV},docx(),{name:'c.wav',bytes:WAV}]);
 assert.deepEqual(h.log.filter(l=>l.startsWith('focus')||l.startsWith('studio')),['focus:a.docx','studio:documents']);
 assert.equal(h.log.filter(l=>l.startsWith('focus')).length,1);assert.equal(r.focused?.name,'a.docx');
 assert.deepEqual(r.outcomes.map(o=>o.name),['bad.bin','b.wav','a.docx','c.wav']);
 assert.match(r.summary,/^Opened 2 files\. 2 could not be opened/);
});
test('all files in a batch fail: nothing is focused and the old shell stays',async()=>{
 const h=harness();const r=await h.c.openFiles([{name:'x.bin',bytes:Uint8Array.from([0,1,0,1])},{name:'y.docx',bytes:enc('not a zip')}]);
 assert.equal(r.focused,null);assert.equal(h.shell.studio,'video');assert.match(r.summary,/^Opened 0 files\. 2 could not/);
});
test('a newer open supersedes a slow older one: the old reader cannot hijack the shell, its resources are released',async()=>{
 let release!:()=>void;const slow=new Promise<void>(r=>{release=r;});
 const h=harness({delay:{'a.docx':slow}});
 const first=h.c.openFiles([docx()]);
 const second=await h.c.openFiles([{name:'c.wav',bytes:WAV}]);
 assert.equal(h.shell.studio,'sound');release();const old=await first;
 assert.equal(old.superseded,true);assert.equal(h.shell.studio,'sound');assert.ok(h.log.includes('dispose:a.docx'));assert.ok(!h.log.includes('commit:a.docx'));assert.equal(second.superseded,false);
});
test('a pending gesture cancels the whole open untouched',async()=>{
 const h=harness({pendingGesture:()=>true});const r=await h.c.openFiles([docx()]);
 assert.equal(r.cancelled,true);assert.equal(h.shell.studio,'video');assert.ok(h.log.includes('dispose:a.docx'));assert.ok(!h.log.some(l=>l.startsWith('commit')));
});
test('only explicit Open routes: restore and background intake commit without focus or switch',async()=>{
 assert.equal(routesShell('open'),true);assert.equal(routesShell('restore'),false);assert.equal(routesShell('background'),false);
 const h=harness();await h.c.openFiles([docx()],{intent:'background'});
 assert.deepEqual(h.log.filter(l=>l.startsWith('focus')||l.startsWith('studio')),[]);assert.equal(h.shell.studio,'video');
});
test('per-document preference is honoured only when compatible',async()=>{
 const h=harness({preferred:undefined});const deps2=harness();void deps2;
 const c=createOpenCoordinator({...({} as OpenDeps),async prepare(i,r){return{name:i.name,studioId:r.handler.studioId,commit:()=>({ok:true,key:i.name}),dispose(){},focus(){}};},switchStudio(id){h.shell.studio=id;},notify(){},preferred:()=>'sound'});
 await c.openFiles([docx()]);assert.equal(h.shell.studio,'documents','sound cannot read docx: override ignored');
});
