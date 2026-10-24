import test from 'node:test';
import assert from 'node:assert/strict';
import {PARAM_SPECS,PRIMITIVE_KINDS,defaultParams,patchParams,readPrimitive,triangleCount,resolveMaterial,MATERIAL_PRESETS,MAX_PRIMITIVE_TRIANGLES,PrimitiveError} from './primitives';
test('every primitive has defaults inside its own ranges and a sane triangle count',()=>{
 for(const k of PRIMITIVE_KINDS){const d=defaultParams(k);for(const s of PARAM_SPECS[k]){assert.ok(d[s.id]>=s.min&&d[s.id]<=s.max,`${k}.${s.id}`);}
  const n=triangleCount(k,d);assert.ok(n>0&&n<MAX_PRIMITIVE_TRIANGLES,k);}
});
test('patching keeps the other values and validates each one',()=>{
 const p=patchParams('sphere',defaultParams('sphere'),{radius:2,widthSegments:16});
 assert.equal(p.radius,2);assert.equal(p.widthSegments,16);assert.equal(p.heightSegments,24);
 assert.throws(()=>patchParams('sphere',p,{radius:0}),PrimitiveError);
 assert.throws(()=>patchParams('sphere',p,{radius:5000}),PrimitiveError);
 assert.throws(()=>patchParams('sphere',p,{widthSegments:2}),PrimitiveError);
 assert.throws(()=>patchParams('sphere',p,{widthSegments:8.5}),PrimitiveError);
 assert.throws(()=>patchParams('sphere',p,{radius:NaN}),PrimitiveError);
 assert.throws(()=>patchParams('sphere',p,{radius:'2'}),PrimitiveError);
 assert.throws(()=>patchParams('sphere',p,{tube:1}),PrimitiveError);
});
test('the triangle cap stops an oversized edit',()=>{
 assert.throws(()=>patchParams('sphere',defaultParams('sphere'),{widthSegments:256,heightSegments:256}),/triangles/);
 assert.throws(()=>patchParams('torus',defaultParams('torus'),{radialSegments:256,tubularSegments:256}),PrimitiveError);
 assert.throws(()=>patchParams('plane',defaultParams('plane'),{segments:256}),PrimitiveError);
 assert.doesNotThrow(()=>patchParams('cube',defaultParams('cube'),{segments:64}));
});
test('a torus tube cannot dwarf its radius',()=>{assert.throws(()=>patchParams('torus',defaultParams('torus'),{tube:5}),PrimitiveError);});
test('stored node data is read back, and bad data is refused',()=>{
 assert.deepEqual(readPrimitive({kind:'cone',params:{radius:1,height:3,radialSegments:12}}),{kind:'cone',params:{radius:1,height:3,radialSegments:12}});
 assert.deepEqual(readPrimitive({kind:'cube',params:{}})?.params,defaultParams('cube'));
 for(const bad of [null,'x',{kind:'teapot',params:{}},{kind:'cube'},{kind:'cube',params:[]},{kind:'cube',params:{width:-1}},{kind:'cube',params:{evil:1}},{kind:'sphere',params:{widthSegments:1e9}}])assert.equal(readPrimitive(bad),null);
});
test('material presets are valid and explicit values override them',()=>{
 for(const p of MATERIAL_PRESETS){assert.match(p.color,/^#[0-9a-f]{6}$/);assert.ok(p.metalness>=0&&p.metalness<=1&&p.roughness>=0&&p.roughness<=1);}
 assert.deepEqual(resolveMaterial({preset:'gold'}),{color:'#ffc857',metalness:1,roughness:0.25});
 assert.equal(resolveMaterial({preset:'gold',roughness:0.8}).roughness,0.8);
 assert.deepEqual(resolveMaterial({metalness:0.2}),{metalness:0.2});
 assert.throws(()=>resolveMaterial({preset:'unobtainium'}),PrimitiveError);
});
