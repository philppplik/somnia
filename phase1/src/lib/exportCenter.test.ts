import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EXPORT_GROUP_IDS,EXPORT_PRESETS,MAX_RECENT,exportGroups,filterExportGroups,readRecents,recentGroup,recordRecent,runPreset,type Command,type ExportGroup,type ExportPreset} from './exportCenter';

const cmd=(id:string,enabled=true):Command=>({id,title:id,category:'Project',enabled:()=>enabled,run:()=>{}});

/** Minimal localStorage shim per test; the module reads globalThis.localStorage lazily. */
function withStorage(fn:()=>void){
 const map=new Map<string,string>();
 const fake={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);},removeItem:(k:string)=>{map.delete(k);},clear:()=>map.clear(),key:()=>null,get length(){return map.size;}};
 const g=globalThis as {localStorage?:Storage};const prev=g.localStorage;
 (g as Record<string,unknown>).localStorage=fake;
 try{fn();}finally{if(prev===undefined)delete (g as Record<string,unknown>).localStorage;else g.localStorage=prev;}
}

test('exportGroups keeps group and command order, presets before commands, drops unknown ids and empty groups',()=>{
 const all=[cmd('project.export.md'),cmd('slides.saveCopy'),cmd('project.export'),cmd('documents.saveCopy'),cmd('documents.export.open'),cmd('documents.export.pdf'),cmd('documents.export.copy')];
 const g=exportGroups(all);
 assert.deepEqual(g.map(x=>x.studio),['project','documents','slides']);
 assert.deepEqual(g[0].rows.map(r=>r.kind==='command'?r.command.id:r.preset.id),['project.export','project.export.md']);
 assert.deepEqual(g[1].rows.map(r=>r.kind==='command'?r.command.id:r.preset.id),['docxCopy','pdfMarkup','pdfClean','documents.export.open','documents.saveCopy','documents.export.pdf','documents.export.copy']);
 assert.deepEqual(g[2].rows.map(r=>r.kind==='command'?r.command.id:r.preset.id),['slides.saveCopy']);
});

test('exportGroups returns nothing when no export command is registered',()=>{
 assert.deepEqual(exportGroups([cmd('edit.undo')]),[]);
});

test('presets appear only when every step command is registered, enabled only when every step is',()=>{
 let g=exportGroups([cmd('vector.exportPng')]);
 assert.deepEqual(g[0].rows.filter(r=>r.kind==='preset').map(r=>(r as {preset:ExportPreset}).preset.id),['png1x','png2x','png4x']);
 assert.ok(g[0].rows.every(r=>r.enabled));
 g=exportGroups([cmd('vector.exportPng',false)]);
 assert.ok(g[0].rows.every(r=>!r.enabled));
 // video presets need both steps: only the format helper registered -> no presets, and the group drops out (format is not a standalone row)
 g=exportGroups([cmd('video.export.format')]);
 assert.equal(g.length,0);
 g=exportGroups([cmd('video.export.format'),cmd('video.export.start')]);
 assert.equal(g.length,1);
 assert.deepEqual(g[0].rows.map(r=>r.kind==='preset'?r.preset.id:r.command.id),['webm','mp4','video.export.start']);
});

test('runPreset runs the steps in order with their payloads',async()=>{
 const seen:[string,unknown][]=[];
 await runPreset(EXPORT_PRESETS.video[1],(id,payload)=>{seen.push([id,payload]);});
 assert.deepEqual(seen,[['video.export.format',{format:'mp4'}],['video.export.start',undefined]]);
 const seen2:[string,unknown][]=[];
 await runPreset(EXPORT_PRESETS.documents[2],(id,payload)=>{seen2.push([id,payload]);});
 assert.deepEqual(seen2,[['documents.export.pdf',{markup:false,tagged:true}]]);
});

test('every listed group id is a non-empty unique command id list; preset ids are unique and stay in their studio namespace',()=>{
 const seen=new Set<string>();
 for(const [studio,ids] of Object.entries(EXPORT_GROUP_IDS)){
  assert.ok(ids.length>0,studio);
  for(const id of ids){assert.ok(!seen.has(id),id);seen.add(id);}
 }
 const pseen=new Set<string>();
 for(const [studio,presets] of Object.entries(EXPORT_PRESETS))for(const p of presets){
  assert.ok(p.id&&p.steps.length>0,studio);
  assert.ok(!pseen.has(p.id),p.id);pseen.add(p.id);
  for(const [id] of p.steps)assert.ok(id.startsWith(studio+'.'),`${studio}:${p.id} -> ${id}`);
 }
});

test('filterExportGroups matches row label and id, case-insensitive; trims; drops empty groups',()=>{
 const groups:ExportGroup[]=[
  {studio:'project',rows:[{kind:'command',command:cmd('project.export'),enabled:true},{kind:'command',command:cmd('project.export.md'),enabled:true}]},
  {studio:'vector',rows:[{kind:'preset',preset:EXPORT_PRESETS.vector[1],enabled:true},{kind:'command',command:{...cmd('vector.exportPng'),title:'Export vector PNG'},enabled:true}]},
 ];
 const label=(id:string)=>id==='png2x'?'PNG 2x':id;
 let f=filterExportGroups(groups,'png',label);
 assert.deepEqual(f.map(g=>g.studio),['vector']);
 assert.equal(f[0].rows.length,2);
 f=filterExportGroups(groups,'EXPORT.MD',label);
 assert.deepEqual(f.map(g=>g.studio),['project']);
 assert.equal(f[0].rows.length,1);
 f=filterExportGroups(groups,'  ',label);
 assert.equal(f.length,2);
 assert.equal(filterExportGroups(groups,'zzz',label).length,0);
 // label miss falls back to preset id match
 f=filterExportGroups(groups,'png2x',()=>'Unrelated');
 assert.deepEqual(f.map(g=>g.studio),['vector']);
});

test('recordRecent dedupes, caps at MAX_RECENT and persists; readRecents validates shape',()=>{
 withStorage(()=>{
  recordRecent('command','project.export');
  recordRecent('preset','png2x');
  recordRecent('command','project.export'); // dedupe to front
  assert.deepEqual(readRecents(),[{kind:'command',id:'project.export'},{kind:'preset',id:'png2x'}]);
  for(let i=0;i<9;i++)recordRecent('command','c'+i);
  const r=readRecents();
  assert.equal(r.length,MAX_RECENT);
  assert.equal(r[0].id,'c8');
  globalThis.localStorage!.setItem('somnia.exportCenter.recent.v1','{"bad":true}');
  assert.deepEqual(readRecents(),[]);
  globalThis.localStorage!.setItem('somnia.exportCenter.recent.v1','not json');
  assert.deepEqual(readRecents(),[]);
 });
});

test('recentGroup keeps stored order across kinds and drops entries that are not registered',()=>{
 withStorage(()=>{
  recordRecent('preset','png2x');
  recordRecent('command','project.export');
  recordRecent('command','unknown.gone');
  const all=[cmd('project.export'),cmd('vector.exportPng')];
  const g=recentGroup(all)!;
  assert.equal(g.studio,'recent');
  assert.deepEqual(g.rows.map(r=>r.kind==='command'?r.command.id:r.preset.id),['project.export','png2x']);
  assert.deepEqual(g.rows.map(r=>r.kind),['command','preset']);
  // nothing registered -> no group
  assert.equal(recentGroup([cmd('edit.undo')]),null);
 });
});

test('recentGroup without storage resolves to null',()=>{
 assert.equal(recentGroup([cmd('project.export')]),null);
});
