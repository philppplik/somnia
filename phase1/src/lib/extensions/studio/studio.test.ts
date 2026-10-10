import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStudioContributions,registerStudioContributions,resetStudioRegistry,importersFor,exportersFor,sectionsFor,commandsFor,slotLayout,validateInterchange,runImporter,runExporter,converterSrcdoc,STUDIO_POINTS,type ConverterPort} from './index';
const PERMS=['studio.import','studio.export','studio.inspector','studio.commands','studio.panels'];
const ok=(x:unknown,id='acme.kit',p:string[]=PERMS)=>{const r=validateStudioContributions(x,id,p);assert.ok(r.ok,JSON.stringify(r));return r.value;};
const bad=(x:unknown,re:RegExp,p:string[]=PERMS)=>{const r=validateStudioContributions(x,'acme.kit',p);assert.equal(r.ok,false);if(!r.ok)assert.match(r.errors.join(' | '),re);};
const sample={
 importers:[{id:'md-doc',label:'Markdown',studio:'documents',formats:[{ext:'md',priority:5}],code:'somnia.converter.onImport(()=>({}))'}],
 exporters:[{id:'txt',label:'Plain text',studio:'documents',format:{ext:'txt',mime:'text/plain'},code:'x'}],
 inspectorSections:[{id:'cell-notes',title:'Cell notes',studio:'sheets',when:['cell'],fields:[{id:'fmt',type:'select',label:'Format',options:[{value:'0.0',label:'One decimal'}],op:{type:'setFormat',valueKey:'format'}}]}],
 commands:[{id:'acme.kit.upper',title:'Uppercase',studio:['documents'],when:['text-range'],category:'Edit'}],
 panels:[{id:'stats',title:'Stats',studio:'documents',slot:'rail-right',html:'<p>hi</p>'}],
};
test('valid contributions pass; absent studios section is fine',()=>{ok(sample);ok(undefined);});
test('permissions gate every list',()=>{bad(sample,/studio\.import/,[]);bad({panels:sample.panels},/studio\.panels/,['studio.import']);});
test('unknown keys, studios and slots are rejected',()=>{
 bad({agentTools:[]},/not a known extension point/);
 bad({...sample,panels:[{...sample.panels[0],studio:'video'}]},/unknown studio/);
 bad({panels:[{...sample.panels[0],studio:'photos',slot:'rail-left'}]},/no "rail-left" slot/);
 bad({panels:[{...sample.panels[0],studio:'sound',slot:'rail-right'}]},/no "rail-right" slot/);
});
test('inspector sections: only studio operations and selection kinds; fields xor html',()=>{
 bad({inspectorSections:[{...sample.inspectorSections[0],when:['slide']}]},/known selection kinds/);
 bad({inspectorSections:[{...sample.inspectorSections[0],fields:[{...sample.inspectorSections[0].fields[0],op:{type:'setAttribute',valueKey:'v'}}]}]},/does not allow operation setAttribute/);
 bad({inspectorSections:[{...sample.inspectorSections[0],html:'<p/>'}]},/either/);
 ok({inspectorSections:[{id:'ro',title:'Read only',studio:'slides',when:['shape'],html:'<p>x</p>'}]});
});
test('command ids stay in the extension namespace',()=>{bad({commands:[{...sample.commands[0],id:'other.up'}]},/must start with "acme\.kit\."/);bad({commands:[{...sample.commands[0],when:['cell']}]},/not a selection kind/);});
test('extension importer claims cannot reach built-in priority 10',()=>bad({importers:[{...sample.importers[0],formats:[{ext:'md',priority:10}]}]},/priority 0 to 9/));
test('registry resolves importers, sections, commands by studio and selection',()=>{
 resetStudioRegistry();const off=registerStudioContributions('acme.kit',ok(sample));
 const second=registerStudioContributions('acme.other',ok({importers:[{...sample.importers[0],id:'md2',formats:[{ext:'MD'.toLowerCase(),priority:7}]}]},'acme.other'));
 assert.deepEqual(importersFor('documents','Notes.MD').map(c=>c.key),['acme.other.md2','acme.kit.md-doc']);
 assert.deepEqual(importersFor('sheets','a.md'),[]);
 assert.equal(exportersFor('documents')[0].key,'acme.kit.txt');
 assert.equal(sectionsFor('sheets','cell').length,1);assert.equal(sectionsFor('sheets','range').length,0);
 assert.equal(commandsFor('documents','text-range').length,1);assert.equal(commandsFor('documents','block').length,0);assert.equal(commandsFor('documents').length,0);
 off();second();assert.equal(importersFor('documents','a.md').length,0);
});
test('slot layout caps panels per slot and never invents slots',()=>{
 resetStudioRegistry();
 for(let i=0;i<6;i++)registerStudioContributions(`acme.p${i}`,ok({panels:[{id:'p',title:'P',studio:'documents',slot:'rail-right',html:'x'}]},`acme.p${i}`));
 const l=slotLayout('documents');assert.deepEqual(l.map(x=>x.slot),['rail-right']);assert.equal(l[0].shown.length,4);assert.equal(l[0].overflow.length,2);
 assert.deepEqual(slotLayout('photos'),[]);resetStudioRegistry();
});
test('Photos is declared but not mounted: nothing resolves',()=>{
 assert.equal(STUDIO_POINTS.photos.mounted,false);resetStudioRegistry();registerStudioContributions('acme.kit',ok({inspectorSections:[{id:'a',title:'A',studio:'photos',when:['layer'],html:'x'}]}));
 assert.equal(sectionsFor('photos','layer').length,0);resetStudioRegistry();
});
test('interchange validation',()=>{
 assert.ok(validateInterchange('blocks',{kind:'blocks',blocks:[{type:'paragraph',text:'a'}]}).ok);
 assert.equal(validateInterchange('blocks',{kind:'cells'}).ok,false);
 assert.equal(validateInterchange('files',{kind:'files',files:{'../x':'y'}}).ok,false);
 assert.equal(validateInterchange('cells',{kind:'cells',sheets:[{name:'S',rows:[[1,'a',null,{}]]}]}).ok,false);
 assert.ok(validateInterchange('raster',{kind:'raster',width:2,height:1,data:new Uint8ClampedArray(8)}).ok);
 assert.equal(validateInterchange('raster',{kind:'raster',width:2,height:1,data:new Uint8ClampedArray(7)}).ok,false);
 assert.equal(validateInterchange('pcm',{kind:'pcm',sampleRate:100,channels:[new Float32Array(2)]}).ok,false);
});
/** Fake sandbox: answers like converterSrcdoc's bridge would. */
const fakePort=(reply:(m:any)=>any|null):ConverterPort=>{let cb:(d:any)=>void=()=>{};return{post:m=>{const r=reply(m);if(r)queueMicrotask(()=>cb(r));},listen:f=>{cb=f;return()=>{cb=()=>{};};}};};
test('importer round trip, bad output and timeout',async()=>{
 const good=fakePort(m=>({type:'convert.result',requestId:m.requestId,ok:true,value:{kind:'blocks',blocks:[{type:'paragraph',text:'hi'}]}}));
 assert.equal((await runImporter(good,'blocks',{name:'a.md',bytes:new ArrayBuffer(4)})as any).blocks[0].text,'hi');
 const wrong=fakePort(m=>({type:'convert.result',requestId:m.requestId,ok:true,value:{kind:'cells',sheets:[]}}));
 await assert.rejects(runImporter(wrong,'blocks',{name:'a',bytes:new ArrayBuffer(1)}),/kind "blocks"/);
 await assert.rejects(runImporter(fakePort(()=>null),'blocks',{name:'a',bytes:new ArrayBuffer(1)},20),/in time/);
 const err=fakePort(m=>({type:'convert.result',requestId:m.requestId,ok:false,error:'boom'}));await assert.rejects(runImporter(err,'blocks',{name:'a',bytes:new ArrayBuffer(1)}),/boom/);
});
test('exporter needs bytes and sanitises the file name',async()=>{
 const snap={kind:'blocks' as const,blocks:[]};
 const good=fakePort(m=>({type:'convert.result',requestId:m.requestId,ok:true,value:new Uint8Array([1,2])}));
 const r=await runExporter(good,snap,'a/b:c.txt','text/plain');assert.equal(r.name,'a_b_c.txt');assert.equal(r.bytes.length,2);
 const str=fakePort(m=>({type:'convert.result',requestId:m.requestId,ok:true,value:'text'}));await assert.rejects(runExporter(str,snap,'a','text/plain'),/Uint8Array/);
});
test('sandbox document has no network and escapes script end tags',()=>{
 const h=converterSrcdoc('var x="</script><b>";');assert.match(h,/default-src 'none'/);assert.doesNotMatch(h,/connect-src|http:|https:/);assert.equal((h.match(/<\/script>/g)||[]).length,2);
});
