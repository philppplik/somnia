import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lightRigLabelKey} from './lightRigLabel';
import type {LightRigPreset} from './stage';

const PRESETS:readonly LightRigPreset[]=['three-point','studio','sunset','outdoor'];

test('every light-rig preset resolves to a translated label key',()=>{
 const en=JSON.parse(readFileSync(new URL('../../locales/studio3d/en.json',import.meta.url),'utf8')) as Record<string,string>;
 for(const p of PRESETS){
  const key=lightRigLabelKey(p);
  assert.ok(en[key],`missing locale key ${key}`);
  assert.notEqual(en[key],key);
  assert.ok(!en[key].includes('studio3d.'),`raw key leaks into the label for ${p}`);
 }
});
