import test from 'node:test';
import assert from 'node:assert/strict';
import {studio3DCommandSpecs} from './commands';

type Schema={properties?:Record<string,unknown>;required?:string[]};

test('command schemas only require declared properties',()=>{
 for(const c of studio3DCommandSpecs()){
  const s=c.params as Schema|undefined;
  if(!s?.required)continue;
  for(const r of s.required)assert.ok(s.properties&&r in s.properties,`${c.id} requires undeclared property ${r}`);
 }
});

test('optional command knobs stay optional in the schema',()=>{
 const specs=studio3DCommandSpecs();
 const req=(id:string)=>(specs.find(c=>c.id===id)!.params as Schema).required??[];
 assert.deepEqual(req('studio3d.edit.bevelEdge'),['width']);
 assert.deepEqual(req('studio3d.sculpt.dab'),['id','x','y','z']);
 assert.deepEqual(req('studio3d.uv.unwrap'),['id']);
 assert.deepEqual(req('studio3d.uv.pack'),['id']);
 assert.deepEqual(req('studio3d.mesh.mirrorMod'),['id','axis','on']);
});
