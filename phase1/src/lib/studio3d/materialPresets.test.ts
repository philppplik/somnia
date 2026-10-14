import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_MATERIAL_PRESETS,checkPreset,presetPatch,readPresets,removePreset,savePreset,type KeyValueStore,type MaterialPreset} from './materialPresets';
const mem=():KeyValueStore&{m:Map<string,string>}=>{const m=new Map<string,string>();return{m,getItem:(k)=>m.get(k)??null,setItem:(k,v)=>{m.set(k,v);}};};
const preset=(over:Partial<MaterialPreset>={}):MaterialPreset=>({name:'Red steel',color:'#cc2233',metalness:0.9,roughness:0.25,emissive:'#000000',emissiveIntensity:1,opacity:1,alphaMode:'opaque',alphaCutoff:0.5,doubleSided:false,...over});
test('save, read and remove roundtrip',()=>{
 const s=mem();
 assert.equal(readPresets(s).length,0);
 const list=savePreset(s,preset());
 assert.equal(list.length,1);
 savePreset(s,preset({name:'Glow',emissive:'#ff8800',emissiveIntensity:4}));
 assert.deepEqual(readPresets(s).map(p=>p.name),['Red steel','Glow']);
 const left=removePreset(s,'Red steel');
 assert.deepEqual(left.map(p=>p.name),['Glow']);
 assert.equal(readPresets(s).length,1);
});
test('saving the same name overwrites in place',()=>{
 const s=mem();
 savePreset(s,preset());
 savePreset(s,preset({name:'Glow'}));
 const list=savePreset(s,preset({metalness:0.1,roughness:0.9}));
 assert.deepEqual(list.map(p=>p.name),['Red steel','Glow']);
 assert.equal(list[0].metalness,0.1);
});
test('name is trimmed and required',()=>{
 const s=mem();
 const list=savePreset(s,preset({name:'  Matte  '}));
 assert.equal(list[0].name,'Matte');
 assert.throws(()=>savePreset(s,preset({name:'   '})),/needs a name/);
 assert.throws(()=>savePreset(s,preset({name:'x'.repeat(61)})),/at most 60/);
});
test('checkPreset validates colours, ranges, alpha mode and doubleSided',()=>{
 assert.throws(()=>checkPreset(preset({color:'red'})),/#rrggbb/);
 assert.throws(()=>checkPreset(preset({emissive:'#12345'})),/#rrggbb/);
 assert.throws(()=>checkPreset(preset({metalness:1.5})),/between 0 and 1/);
 assert.throws(()=>checkPreset(preset({roughness:-0.1})),/between 0 and 1/);
 assert.throws(()=>checkPreset(preset({opacity:2})),/between 0 and 1/);
 assert.throws(()=>checkPreset(preset({emissiveIntensity:99})),/between 0 and 20/);
 assert.throws(()=>checkPreset(preset({alphaCutoff:1.2})),/between 0 and 1/);
 assert.throws(()=>checkPreset(preset({alphaMode:'add' as MaterialPreset['alphaMode']})),/opaque, blend, mask/);
 assert.throws(()=>checkPreset(preset({doubleSided:1 as unknown as boolean})),/true or false/);
});
test('the library caps at the maximum',()=>{
 const s=mem();
 for(let i=0;i<MAX_MATERIAL_PRESETS;i++)savePreset(s,preset({name:`p${i}`}));
 assert.throws(()=>savePreset(s,preset({name:'one too many'})),/full/);
 assert.equal(readPresets(s).length,MAX_MATERIAL_PRESETS);
});
test('corrupted storage and invalid entries are tolerated',()=>{
 const s=mem();
 s.setItem('somnia.studio3d.materialPresets.v1','not json');
 assert.deepEqual(readPresets(s),[]);
 s.setItem('somnia.studio3d.materialPresets.v1',JSON.stringify([preset(),{name:'bad',color:'nope'},preset({name:'dupe'}),preset({name:'dupe'})]));
 assert.deepEqual(readPresets(s).map(p=>p.name),['Red steel','dupe']);
});
test('removing an unknown preset fails',()=>{
 assert.throws(()=>removePreset(mem(),'ghost'),/no preset called/);
});
test('presetPatch maps to a material patch without the name',()=>{
 const patch=presetPatch(preset({emissiveIntensity:3,opacity:0.4,alphaMode:'blend'}));
 assert.deepEqual(patch,{color:'#cc2233',metalness:0.9,roughness:0.25,emissive:'#000000',emissiveIntensity:3,opacity:0.4,alphaMode:'blend',alphaCutoff:0.5,doubleSided:false});
 assert.ok(!('name' in patch));
});
