import test from 'node:test';
import assert from 'node:assert/strict';
import {studio3DExportPlan,studio3DExportSchema,studio3DOptionsToValues,valuesToStudio3DOptions,STUDIO3D_EXPORT_DEFAULTS as D,type Studio3DExportContext} from './exportAdvanced';
import {EXPORT_GROUP_IDS} from '../exportCenter';
const ctx=(o:Partial<Studio3DExportContext>={}):Studio3DExportContext=>({selected:0,hasContent:true,maxRender:16384,...o});
const v=(o:Partial<typeof D>={})=>studio3DOptionsToValues({...D,name:'scene',...o});
test('schema: name, content, selection and still size are validated',()=>{
 const s=studio3DExportSchema(ctx());
 assert.equal(s.validate(studio3DOptionsToValues(D)),'export.error.name');
 assert.equal(s.validate(v()),null);
 assert.equal(studio3DExportSchema(ctx({hasContent:false})).validate(v()),'export.error.empty3d');
 assert.equal(s.validate(v({selectionOnly:true})),'export.error.selection');
 assert.equal(studio3DExportSchema(ctx({selected:2})).validate(v({selectionOnly:true})),null);
 assert.equal(s.validate(v({format:'stl',selectionOnly:true})),null,'meshes ignore the selection-only flag');
 assert.equal(s.validate(v({format:'png',customSize:true,width:0})),'export.error.size3d');
 assert.equal(s.validate(v({format:'png',customSize:true,width:20000,height:100})),'export.error.size3d');
 assert.equal(s.validate(v({format:'png',customSize:true,width:800,height:600})),null);
 assert.equal(studio3DExportSchema(ctx({hasContent:false})).validate(v({format:'png'})),null,'a still renders the view even for an empty scene');
});
test('fields show per format',()=>{
 const s=studio3DExportSchema(ctx());const vis=(o:Record<string,string|number|boolean>)=>s.fields.filter(f=>!f.visibleWhen||f.visibleWhen(o)).map(f=>f.id);
 assert.deepEqual(vis({format:'glb'}),['format','name','selectionOnly']);
 assert.deepEqual(vis({format:'gltf'}),['format','name','textures','selectionOnly']);
 assert.deepEqual(vis({format:'obj'}),['format','name','unit']);
 assert.deepEqual(vis({format:'png',customSize:true}),['format','name','customSize','width','height','transparent']);
});
test('options: bad input falls back to defaults',()=>{
 const o=valuesToStudio3DOptions({format:'fbx',textures:'zip',unit:'ft',width:'x'});
 assert.deepEqual([o.format,o.textures,o.unit,o.width],['glb','embed','m',1920]);
});
test('plans run only registered commands, with the chosen name',()=>{
 assert.deepEqual(studio3DExportPlan({...D,name:'hero',format:'glb',selectionOnly:true}),[{id:'studio3d.export.options',payload:{selection:true}},{id:'studio3d.export.glb',payload:{name:'hero'}}]);
 assert.deepEqual(studio3DExportPlan({...D,name:'hero',format:'gltf',textures:'external'}),[{id:'studio3d.export.options',payload:{selection:false,textures:'external'}},{id:'studio3d.export.gltf',payload:{name:'hero'}}]);
 assert.deepEqual(studio3DExportPlan({...D,name:'part',format:'stl',unit:'mm'}),[{id:'studio3d.unit.set',payload:{unit:'mm'}},{id:'studio3d.export.mesh',payload:{format:'stl',name:'part'}}]);
 assert.deepEqual(studio3DExportPlan({...D,name:'shot',format:'png',transparent:true}),[{id:'studio3d.render.still',payload:{name:'shot',transparent:true}}]);
 assert.deepEqual(studio3DExportPlan({...D,name:'shot',format:'png',customSize:true,width:800,height:600}),[{id:'studio3d.render.still',payload:{name:'shot',transparent:false,width:800,height:600}}]);
});
test('export center lists the advanced command first for 3D',()=>{assert.equal(EXPORT_GROUP_IDS['3d'][0],'studio3d.export.advanced');});
