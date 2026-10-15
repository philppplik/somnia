import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EXPORT_GROUP_IDS,EXPORT_PRESETS,exportGroups,filterExportGroups,runPreset,type ExportGroup,type ExportPreset} from './exportCenter';
import type {Command} from './commandRegistry';

const cmd=(id:string):Command=>({id,title:id,category:'Project',level:'ui',run:()=>{}});

test('exportGroups keeps group and command order, drops unknown ids and empty groups',()=>{
 const all=[cmd('project.export.md'),cmd('slides.saveCopy'),cmd('project.export'),cmd('documents.saveCopy'),cmd('documents.export.open')];
 const g=exportGroups(all);
 assert.deepEqual(g.map(x=>x.studio),['project','documents','slides']);
 assert.deepEqual(g[0].commands.map(c=>c.id),['project.export','project.export.md']);
 assert.deepEqual(g[1].commands.map(c=>c.id),['documents.export.open','documents.saveCopy']);
 assert.deepEqual(g[2].commands.map(c=>c.id),['slides.saveCopy']);
});

test('exportGroups returns nothing when no export command is registered',()=>{
 assert.deepEqual(exportGroups([cmd('edit.undo')]),[]);
});

test('every listed group id is a non-empty unique command id list',()=>{
 const seen=new Set<string>();
 for(const [studio,ids] of Object.entries(EXPORT_GROUP_IDS)){
  assert.ok(ids.length>0,studio);
  for(const id of ids){assert.ok(!seen.has(id),id);seen.add(id);}
 }
});

test('presets appear only when every step command is registered, enabled only when every step is',()=>{
 const on=(id:string,en=true):Command=>({id,title:id,category:'Project',level:'ui',enabled:()=>en,run:()=>{}});
 let g=exportGroups([on('vector.exportPng')]);
 assert.deepEqual(g[0].presets.map(p=>p.preset.id),['png1x','png2x','png4x']);
 assert.ok(g[0].presets.every(p=>p.enabled));
 g=exportGroups([on('vector.exportPng',false)]);
 assert.ok(g[0].presets.every(p=>!p.enabled));
 // video presets need both steps: only the format helper registered -> no presets, and the group drops out (format is not a standalone row)
 g=exportGroups([on('video.export.format')]);
 assert.equal(g.length,0);
 // groups with neither commands nor presets drop out; groups with only presets survive
 g=exportGroups([on('video.export.format'),on('video.export.start')]);
 assert.equal(g.length,1);
 assert.deepEqual(g[0].presets.map(p=>p.preset.id),['webm','mp4']);
});

test('runPreset runs the steps in order with their payloads',async()=>{
 const seen:[string,unknown][]=[];
 const p:ExportPreset=EXPORT_PRESETS.video[1];
 await runPreset(p,(id,payload)=>{seen.push([id,payload]);});
 assert.deepEqual(seen,[['video.export.format',{format:'mp4'}],['video.export.start',undefined]]);
 const seen2:[string,unknown][]=[];
 await runPreset(EXPORT_PRESETS.documents[2],(id,payload)=>{seen2.push([id,payload]);});
 assert.deepEqual(seen2,[['documents.export.pdf',{markup:false,tagged:true}]]);
});

test('preset steps stay inside their studio namespace and presets have unique ids',()=>{
 const seen=new Set<string>();
 for(const [studio,presets] of Object.entries(EXPORT_PRESETS))for(const p of presets){
  assert.ok(p.id&&p.steps.length>0,studio);
  assert.ok(!seen.has(p.id),p.id);seen.add(p.id);
  for(const [id] of p.steps)assert.ok(id.startsWith(studio+'.'),`${studio}:${p.id} -> ${id}`);
 }
});

test('filterExportGroups matches command title and id, preset label and id, case-insensitive',()=>{
 const groups:ExportGroup[]=[
  {studio:'project',commands:[cmd('project.export'),cmd('project.export.md')],presets:[]},
  {studio:'vector',commands:[{...cmd('vector.exportPng'),title:'Export vector PNG'}],presets:[{preset:EXPORT_PRESETS.vector[1],enabled:true}]},
 ];
 const label=(id:string)=>'PNG 2x';
 let f=filterExportGroups(groups,'png',label);
 assert.deepEqual(f.map(g=>g.studio),['vector']);
 assert.deepEqual(f[0].commands.map(c=>c.id),['vector.exportPng']);
 assert.deepEqual(f[0].presets.map(p=>p.preset.id),['png2x']);
 f=filterExportGroups(groups,'EXPORT.MD',label);
 assert.deepEqual(f.map(g=>g.studio),['project']);
 assert.deepEqual(f[0].commands.map(c=>c.id),['project.export.md']);
 f=filterExportGroups(groups,'  ',label);
 assert.equal(f.length,2);
 f=filterExportGroups(groups,'zzz',label);
 assert.equal(f.length,0);
 // label miss falls back to preset id match
 f=filterExportGroups(groups,'png2x',()=>'Unrelated');
 assert.deepEqual(f.map(g=>g.studio),['vector']);
});
