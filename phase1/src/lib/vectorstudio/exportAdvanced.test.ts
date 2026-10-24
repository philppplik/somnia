import test from 'node:test';
import assert from 'node:assert/strict';
import {vectorShellCommandSpecs} from './shellCommands';
import {createBlankVector,getVectorSession,resetVectorSession} from './session';
import {getVectorExportAdvancedOpen,setVectorExportAdvancedOpen} from './exportAdvancedState';
import {vectorExportSchema,vectorOptionsToValues,valuesToVectorOptions,vectorPngSize,VECTOR_EXPORT_DEFAULTS,VECTOR_PNG_MAX_SIDE} from './vectorExportSchema';
import {buildVectorExport} from './exportAdvanced';
import {EXPORT_GROUP_IDS} from '../exportCenter';
const area=(w:number,h:number)=>()=>({width:w,height:h});
test('schema: name, area and PNG size are validated',()=>{
 const v=vectorOptionsToValues(VECTOR_EXPORT_DEFAULTS);
 assert.equal(vectorExportSchema(area(100,50)).validate(v),'export.error.name');
 assert.equal(vectorExportSchema(area(100,50)).validate({...v,name:'logo'}),null);
 assert.equal(vectorExportSchema(()=>null).validate({...v,name:'logo',area:'selection'}),'export.error.area');
 assert.equal(vectorExportSchema(area(100,50)).validate({...v,name:'logo',padding:5000}),'export.error.dims');
 assert.equal(vectorExportSchema(area(4096,4096)).validate({...v,name:'logo',format:'png',scalePercent:400}),'export.error.dims');
 assert.equal(vectorExportSchema(area(4096,4096)).validate({...v,name:'logo',format:'png',scalePercent:100}),null);
 assert.equal(vectorExportSchema(area(4096,4096)).validate({...v,name:'logo',scalePercent:800}),null,'size limits only apply to PNG');
});
test('schema: PNG-only fields hide for SVG, exact size fields show only in exact mode',()=>{
 const s=vectorExportSchema(area(10,10));const vis=(v:Record<string,string|number|boolean>)=>s.fields.filter(f=>!f.visibleWhen||f.visibleWhen(v)).map(f=>f.id);
 assert.deepEqual(vis({format:'svg',area:'page'}),['format','name','area','metaTitle','metaDescription']);
 assert.ok(vis({format:'png',mode:'exact',area:'content'}).includes('width'));
 assert.ok(!vis({format:'png',mode:'percent'}).includes('width'));
 assert.ok(vis({format:'png',area:'content'}).includes('padding'));
});
test('options: values round-trip and bad input falls back to defaults',()=>{
 assert.deepEqual(valuesToVectorOptions(vectorOptionsToValues({...VECTOR_EXPORT_DEFAULTS,name:'a',format:'png',area:'content',padding:4})),{...VECTOR_EXPORT_DEFAULTS,name:'a',format:'png',area:'content',padding:4});
 const o=valuesToVectorOptions({format:'gif',area:'galaxy',background:'pink',mode:'x'});
 assert.equal(o.format,'svg');assert.equal(o.area,'page');assert.equal(o.background,'transparent');assert.equal(o.mode,'percent');
});
test('PNG size: percent, exact with aspect lock, and the per-side limit',()=>{
 const o=VECTOR_EXPORT_DEFAULTS;
 assert.deepEqual(vectorPngSize({...o,scalePercent:200},{width:400,height:300}),{width:800,height:600});
 assert.deepEqual(vectorPngSize({...o,mode:'exact',width:200,height:0},{width:400,height:300}),{width:200,height:150});
 assert.throws(()=>vectorPngSize({...o,scalePercent:800},{width:2000,height:100}));
 assert.equal(VECTOR_PNG_MAX_SIDE,8192);
});
test('SVG build: name, metadata and area size come through; PNG name differs only by extension',async()=>{
 createBlankVector(300,200,'Poster.svg');
 const r=await buildVectorExport({...VECTOR_EXPORT_DEFAULTS,name:'brand',metaTitle:'Brand & Co',metaDescription:'Hero <mark>'});
 assert.equal(r.filename,'brand.svg');assert.equal(r.width,300);assert.equal(r.height,200);
 const text=await r.blob.text();
 assert.match(text,/<title>Brand &amp; Co<\/title><desc>Hero &lt;mark&gt;<\/desc>/);
 assert.equal(r.bytes,r.blob.size);
 await assert.rejects(()=>buildVectorExport({...VECTOR_EXPORT_DEFAULTS,name:'x',area:'selection'}),/Select at least one object/);
 resetVectorSession();
});
test('command opens the dialog only for an open vector document, and the export center lists it first',()=>{
 resetVectorSession();
 const spec=vectorShellCommandSpecs(()=>true).find(s=>s.id==='vector.export.advanced')!;
 assert.equal(spec.enabled?.({origin:'ui'}),false);
 createBlankVector(64,64);assert.equal(spec.enabled?.({origin:'ui'}),true);
 const before=getVectorSession();setVectorExportAdvancedOpen(false);spec.run(undefined,{origin:'ui'});
 assert.equal(getVectorExportAdvancedOpen(),true);assert.equal(getVectorSession(),before,'opening the dialog never touches the drawing');
 setVectorExportAdvancedOpen(false);resetVectorSession();
 assert.equal(EXPORT_GROUP_IDS.vector[0],'vector.export.advanced');
});
