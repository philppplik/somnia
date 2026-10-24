import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MemoryController,canDownload,canEnable,downloadPercent,formatBytes,searchModeLabel,vectorPhase,provenanceLabel} from './memory';
import type {ModelState,VectorStatus} from './memory';
import {bundleDiff,lineDiff,parseSkillsIndex,scanSummary,trustBadge} from './skills';
import {createFixtureMemoryTransport,createFixtureSkillsTransport,E5_TOTAL} from './memorySkillsFixture';
import {MS_CATALOGUES,ms} from './i18nMemorySkills';
const vec=(o:Partial<VectorStatus>={}):VectorStatus=>({spaceId:'s',compiledIn:true,enabled:false,modelId:null,dims:null,indexed:0,total:2,...o});
const mod=(o:Partial<ModelState>={}):ModelState=>({modelId:'m',status:'missing',totalBytes:1000,downloadedBytes:0,...o});
test('vector phases: nothing is on by default and every step is explicit',()=>{
 assert.equal(vectorPhase(vec({compiledIn:false}),mod()),'unavailable');
 assert.equal(vectorPhase(vec(),mod()),'needs-model');
 assert.equal(vectorPhase(vec(),mod({status:'downloading'})),'downloading');
 assert.equal(vectorPhase(vec(),mod({status:'ready'})),'ready-to-enable');
 assert.equal(vectorPhase(vec({enabled:true,indexed:1}),mod({status:'ready'})),'indexing');
 assert.equal(vectorPhase(vec({enabled:true,indexed:2}),mod({status:'ready'})),'on');
 assert.equal(canEnable(vec(),mod({status:'ready'}),false),false,'needs acknowledgement');
 assert.equal(canEnable(vec(),mod({status:'missing'}),true),false,'needs the model');
 assert.equal(canEnable(vec(),mod({status:'ready'}),true),true);
 assert.equal(canDownload(vec(),mod({status:'ready'})),false);
 assert.equal(canDownload(vec(),mod()),true);
});
test('formatting and labels',()=>{
 assert.equal(formatBytes(E5_TOTAL),'465 MB');assert.equal(formatBytes(512),'512 B');assert.equal(formatBytes(-1),'?');
 assert.equal(downloadPercent(mod({downloadedBytes:250})),25);assert.equal(downloadPercent(mod({totalBytes:0})),0);
 assert.match(searchModeLabel({mode:'fts5',vectorFallbackReason:'vector_not_opted_in',hits:[]}),/meaning search is off/);
 assert.equal(searchModeLabel({mode:'hybrid',vectorFallbackReason:null,hits:[]}),'Keyword + meaning');
 const t=createFixtureMemoryTransport();
 return t.list('space-1',true).then(items=>{const p=provenanceLabel(items[1]);assert.equal(p.needsReview,true);assert.equal(p.source,'Agent · run-7');});
});
test('controller: opt-in flow needs the exact download size, then consent, then enable',async()=>{
 const tr=createFixtureMemoryTransport();const c=new MemoryController(tr,'space-1');await c.refresh();
 assert.equal(c.getSnapshot().vector!.enabled,false);
 await c.enableVector(true);assert.equal(tr.calls.some(x=>x.type==='enableVector'),false,'model missing: no enable');
 await c.downloadModel();const dl=tr.calls.find(x=>x.type==='downloadModel')!;assert.equal(dl.acknowledgedBytes,E5_TOTAL);
 await c.cancelDownload();assert.equal(c.getSnapshot().model!.status,'missing');
 tr.finishDownload();await c.refresh();
 await c.enableVector(false);assert.equal(tr.calls.some(x=>x.type==='enableVector'),false,'no ack: no enable');
 await c.enableVector(true);assert.equal(c.getSnapshot().vector!.enabled,true);
 await c.disableVector();assert.equal(c.getSnapshot().vector!.enabled,false);
});
test('controller: add/search/review/delete/clear and errors surface',async()=>{
 const tr=createFixtureMemoryTransport();const c=new MemoryController(tr,'space-1');await c.refresh();
 await c.add('note','  ','   ');assert.equal(tr.calls.some(x=>x.type==='add'),false);
 await c.add('fact','T','hello world');assert.equal(c.getSnapshot().items.some(i=>i.content==='hello world'),true);
 await c.search('vite');assert.equal(c.getSnapshot().search!.hits.length,0,'pending-review items are not searchable');
 await c.review('m2',true);await c.search('vite');assert.equal(c.getSnapshot().search!.hits.length,1);
 assert.equal(c.getSnapshot().search!.mode,'fts5');
 await c.remove('m1');assert.equal(c.getSnapshot().items.some(i=>i.id==='m1'),false);
 await c.clearAll();assert.equal(c.getSnapshot().items.length,0);
 const bad=createFixtureMemoryTransport();bad.list=async()=>{throw new Error('boom');};const c2=new MemoryController(bad,'space-1');await c2.refresh();assert.equal(c2.getSnapshot().error,'boom');
});
test('skills: trust badges never promise script execution',()=>{
 for(const k of ['unreviewed','scanned','verified'] as const)assert.doesNotMatch(trustBadge(k).scripts,/^Scripts run/);
 assert.match(trustBadge('unreviewed').scripts,/disabled/);
 assert.equal(trustBadge('verified').label,'Verified');
});
test('skills: scan summary headline and caveat',()=>{
 const f=(severity:'high'|'medium'|'info')=>({rule:'r',severity,file:'a',line:1,excerpt:'x'});
 assert.equal(scanSummary({findings:[],passed:true,scannerVersion:1}).headline,'No findings');
 assert.match(scanSummary({findings:[f('high'),f('high')],passed:false,scannerVersion:1}).headline,/2 serious/);
 assert.match(scanSummary({findings:[f('medium')],passed:true,scannerVersion:1}).headline,/1 note to check/);
 assert.match(scanSummary({findings:[],passed:true,scannerVersion:1}).caveat,/not a safety guarantee/);
});
test('skills: line diff',()=>{
 assert.deepEqual(lineDiff('a\nb\nc','a\nc\nd'),[{kind:'same',text:'a'},{kind:'del',text:'b'},{kind:'same',text:'c'},{kind:'add',text:'d'}]);
 assert.deepEqual(lineDiff('','x'),[{kind:'del',text:''},{kind:'add',text:'x'}]);
 assert.ok(lineDiff('x\n'.repeat(10000),'y\n'.repeat(10000)).length<=8002,'capped');
});
test('skills: update diff shows changed scripts, new findings and newly requested tools',async()=>{
 const tr=createFixtureSkillsTransport();const a=(await tr.getVersion('s1',1))!,b=(await tr.getVersion('s1',2))!;
 const d=bundleDiff(a,b);
 assert.equal(d.changedFiles.length,1);assert.equal(d.changedFiles[0].path,'scripts/run.sh');assert.equal(d.changedFiles[0].status,'changed');
 assert.equal(d.newFindings.length,1);assert.equal(d.newFindings[0].rule,'network-call');
 assert.deepEqual(d.toolsAdded,['Bash']);
 assert.ok(d.skillMd.some(l=>l.kind==='add'&&/upload/.test(l.text)));
});
test('skills.sh index parser is strict and read-only',()=>{
 const ok=parseSkillsIndex({skills:[{name:'pdf-tools',repo:'owner/repo',description:'d',installs:5},{name:'Bad Name',repo:'o/r'},{name:'x',repo:'../../etc'},{name:'y',repo:'https://evil/x'},null,{name:'z',repo:'o/r',installs:-1}]});
 assert.deepEqual(ok.map(e=>e.name),['pdf-tools','z']);assert.equal(ok[1].installs,null);
 assert.throws(()=>parseSkillsIndex('nope'));
});
test('i18n: five locales have identical keys and identical placeholders',()=>{
 const base=Object.keys(MS_CATALOGUES.en).sort();
 for(const [l,c] of Object.entries(MS_CATALOGUES)){
  assert.deepEqual(Object.keys(c).sort(),base,l);
  for(const k of base){assert.ok(c[k].trim().length>0,`${l}:${k}`);const ph=(s:string)=>(s.match(/\{\w+\}/g)??[]).sort().join();assert.equal(ph(c[k]),ph(MS_CATALOGUES.en[k]),`${l}:${k} placeholders`);}
 }
 assert.deepEqual(Object.keys(MS_CATALOGUES).sort(),['de','en','es','fr','pt-BR']);
 assert.equal(ms('de','vsm.vector.download',{size:'465 MB'}),'Modell herunterladen (465 MB)');
 assert.equal(ms('xx','vsm.title'),'Memory');
 for(const l of ['en','de','es','fr','pt-BR'])JSON.parse(readFileSync(`src/locales/vibespace-a6/${l}.json`,'utf8'));
});
