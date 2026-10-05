import test from 'node:test';import assert from 'node:assert/strict';
import * as ls from './libraryShare';
import * as cs from './componentSystem';
let n=0;const id=()=>`n${++n}`;
const comp=(cid:string,name:string,vs:Array<[string,string,string]>,def?:string):cs.Component=>({id:cid,name,variants:vs.map(([i,nm,html])=>({id:i,name:nm,html})),defaultVariantId:def??vs[0][0]});
const btn=comp('c1','Button',[['v1','Primary','<button class="a">x</button>'],['v2','Outline','<button class="b">x</button>']]);
const card=comp('c2','Card',[['v3','Default','<div class="card"></div>']]);

test('export then import round-trips and strips marks',()=>{
 const marked=comp('c9','Hero',[['v9','Default',cs.markInstance('<section class="h">x</section>','c9','v9')]]);
 const raw=ls.exportLibrary([btn,marked],()=>'2026-10-05T00:00:00.000Z');
 const j=JSON.parse(raw);assert.equal(j.format,ls.FORMAT);assert.equal(j.version,1);assert.ok(!raw.includes('data-somnia-'));
 const p=ls.parseImport(raw);assert.deepEqual(p.warnings,[]);assert.equal(p.components.length,2);assert.deepEqual(p.components[0],btn);
});
test('file name uses the date',()=>{assert.equal(ls.exportFileName(new Date('2026-10-05T10:00:00Z')),'somnia-components-2026-10-05.json');});
test('import refuses wrong files with plain errors',()=>{
 assert.throws(()=>ls.parseImport(''),/empty/);assert.throws(()=>ls.parseImport('nope'),/not valid JSON/);
 assert.throws(()=>ls.parseImport('[]'),/not a Somnia/);assert.throws(()=>ls.parseImport('{"format":"other"}'),/not a Somnia/);
 assert.throws(()=>ls.parseImport(JSON.stringify({format:ls.FORMAT,version:2,components:[]})),/newer Somnia/);
 assert.throws(()=>ls.parseImport(JSON.stringify({format:ls.FORMAT,version:1})),/no component list/);
 assert.throws(()=>ls.parseImport('x'.repeat(ls.MAX_IMPORT_BYTES+1)),/4 MB/);
});
test('import skips bad entries and reports them',()=>{
 const raw=JSON.stringify({format:ls.FORMAT,version:1,components:[btn,{id:'x'},{...card,id:'c3',name:'card'},card,{id:'c4',name:'Big',defaultVariantId:'z',variants:[{id:'z',name:'Z',html:'<p>'+'x'.repeat(100001)+'</p>'}]},{id:'c5',name:'Fix',defaultVariantId:'nope',variants:[{id:'f',name:'F',html:'<i></i>'}]}]});
 const p=ls.parseImport(raw);assert.deepEqual(p.components.map(c=>c.name),['Button','card','Fix']);
 assert.equal(p.components[2].defaultVariantId,'f');assert.equal(p.warnings.length,4);
});
test('import caps components and variants at the library limits',()=>{
 const many=Array.from({length:45},(_,i)=>comp(`c${i}`,`C${i}`,[[`v${i}`,'D','<p></p>']]));
 const p=ls.parseImport(JSON.stringify({format:ls.FORMAT,version:1,components:many}));assert.equal(p.components.length,cs.LIMITS.components);
 const vs=Array.from({length:10},(_,i)=>[`v${i}`,`V${i}`,'<p></p>'] as [string,string,string]);
 const q=ls.parseImport(JSON.stringify({format:ls.FORMAT,version:1,components:[comp('c','Wide',vs)]}));assert.equal(q.components[0].variants.length,cs.LIMITS.variants);
});
test('project library file: missing is null, broken throws, valid reads',()=>{
 assert.equal(ls.readProjectLibrary({}),null);assert.equal(ls.readProjectLibrary({[ls.PROJECT_LIBRARY_PATH]:'  '}),null);
 assert.throws(()=>ls.readProjectLibrary({[ls.PROJECT_LIBRARY_PATH]:'{'}));
 assert.equal(ls.readProjectLibrary({[ls.PROJECT_LIBRARY_PATH]:ls.exportLibrary([btn])})!.components.length,1);
 assert.equal(ls.projectFirst(null,[card])[0].name,'Card');assert.equal(ls.projectFirst([btn],[card])[0].name,'Button');
});
test('planMerge: new, identical, conflict by name ignoring case',()=>{
 const inc=[comp('x1','button',[['a','Primary','<button class="a">x</button>'],['b','Outline','<button class="b">x</button>']]),comp('x2','BUTTON',[['q','Only','<b></b>']]),comp('x3','Nav',[['n','D','<nav></nav>']])];
 assert.deepEqual(ls.planMerge([btn],inc).map(i=>i.status),['identical','conflict','new']);
});
test('applyMerge adds new components and skips identical ones',()=>{
 const r=ls.applyMerge([btn],[btn,card],()=>'skip',id);assert.equal(r.list.length,2);assert.deepEqual(r.report.added,['Card']);assert.deepEqual(r.report.skipped,['Button']);
});
test('id clash with a different name gets a fresh id',()=>{
 const other=comp('c1','Other',[['v1','D','<p></p>']]);const r=ls.applyMerge([btn],[other],()=>'skip',id);
 const added=r.list.find(c=>c.name==='Other')!;assert.notEqual(added.id,'c1');assert.equal(new Set(r.list.map(c=>c.id)).size,2);
});
test('conflict: skip leaves the existing one',()=>{const inc=comp('x','Button',[['q','Only','<b></b>']]);const r=ls.applyMerge([btn],[inc],()=>'skip',id);assert.deepEqual(r.list,[btn]);assert.deepEqual(r.report.skipped,['Button']);});
test('conflict: replace keeps the local id and takes the incoming variants',()=>{
 const inc=comp('x','Button',[['q','Only','<b></b>']]);const r=ls.applyMerge([btn,card],[inc],()=>'replace',id);
 assert.equal(r.list[0].id,'c1');assert.deepEqual(r.list[0].variants.map(v=>v.name),['Only']);assert.equal(r.list[0].defaultVariantId,'q');assert.deepEqual(r.list[1],card);
});
test('conflict: keep-both renames with "(imported)" and gives all-new ids',()=>{
 const inc=comp('c1','Button',[['v1','Only','<b></b>']]);const r=ls.applyMerge([btn],[inc],()=>'keep-both',id);
 const added=r.list[1];assert.equal(added.name,'Button (imported)');assert.notEqual(added.id,'c1');assert.notEqual(added.variants[0].id,'v1');assert.equal(added.defaultVariantId,added.variants[0].id);
 const r2=ls.applyMerge(r.list,[inc],()=>'keep-both',id);assert.equal(r2.list[2].name,'Button (imported 2)');
});
test('keep-both keeps a long name within the 60 character limit',()=>{
 const long='L'.repeat(60);const a=comp('a',long,[['v','D','<p></p>']]);const b=comp('b',long,[['w','E','<i></i>']]);
 const r=ls.applyMerge([a],[b],()=>'keep-both',id);assert.ok(r.list[1].name.length<=cs.LIMITS.name);assert.match(r.list[1].name,/\(imported\)$/);
});
test('conflict: merge-variants adds missing variants and renames same-name different-html ones',()=>{
 const inc=comp('x','Button',[['a','Primary','<button class="a">x</button>'],['b','Outline','<button class="CHANGED">x</button>'],['c','Ghost','<button class="g">x</button>']]);
 const r=ls.applyMerge([btn],[inc],()=>'merge-variants',id);const m=r.list[0];
 assert.deepEqual(m.variants.map(v=>v.name),['Primary','Outline','Outline (imported)','Ghost']);assert.equal(m.id,'c1');assert.equal(m.defaultVariantId,'v1');
 assert.equal(new Set(m.variants.map(v=>v.id)).size,4);assert.equal(r.report.merged[0],'Button');assert.equal(r.report.renamed.length,1);
});
test('merge-variants over the variant limit throws and changes nothing',()=>{
 const vs=Array.from({length:7},(_,i)=>[`v${i}`,`V${i}`,'<p></p>'] as [string,string,string]);const base=comp('c','Wide',vs);
 const inc=comp('x','Wide',[['a','A','<a></a>'],['b','B','<b></b>']]);const before=JSON.stringify([base]);
 assert.throws(()=>ls.applyMerge([base],[inc],()=>'merge-variants',id),/more than 8 variants/);assert.equal(JSON.stringify([base]),before);
});
test('adding past the component limit throws',()=>{
 const full=Array.from({length:40},(_,i)=>comp(`c${i}`,`C${i}`,[[`v${i}`,'D','<p></p>']]));
 assert.throws(()=>ls.applyMerge(full,[card],()=>'skip',id),/Nothing was imported/);
 assert.throws(()=>ls.applyMerge(full,[comp('z','C1',[['q','Q','<q></q>']])],()=>'keep-both',id),/Nothing was imported/);
});
test('applyMerge does not mutate its inputs',()=>{
 const a=JSON.stringify([btn]);const b=JSON.stringify([card]);ls.applyMerge([btn],[card,comp('x','Button',[['q','Q','<q></q>']])],()=>'replace',id);assert.equal(JSON.stringify([btn]),a);assert.equal(JSON.stringify([card]),b);
});
test('describeReport',()=>{assert.equal(ls.describeReport({added:['a'],replaced:[],merged:['b'],skipped:['c','d'],renamed:[]}),'Import done: 1 added, 1 merged, 2 skipped.');assert.equal(ls.describeReport({added:[],replaced:[],merged:[],skipped:[],renamed:[]}),'Import done: nothing to change.');});
