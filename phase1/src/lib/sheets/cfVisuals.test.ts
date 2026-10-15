import test from 'node:test';import assert from 'node:assert/strict';
import {cfLayers,iconSvg,iconLevels} from './cfVisuals';
import {CF_ICON_SETS} from './cfOps';
test('every icon of every set draws and the rest is refused',()=>{
 for(const s of CF_ICON_SETS){const k=iconLevels(s);assert.ok(k>=3);for(let i=0;i<k;i++){const v=iconSvg(s,i);assert.ok(v&&v.startsWith('<svg')&&!v.includes('NaN'),s+i);}
  assert.equal(iconSvg(s,k),null);assert.equal(iconSvg(s,-1),null);assert.equal(iconSvg(s,1.5),null);}
 assert.equal(iconSvg('Bogus',0),null);assert.equal(iconSvg('3Arrows" onload="x',0),null);
});
test('bar and icon layers are bounded and validated',()=>{
 assert.equal(cfLayers(null,null,1),null);
 const l=cfLayers([0.5,'#638EC6',true],['3Arrows',2],2)!;assert.match(l.image,/^url\("data:image\/svg\+xml,/);assert.match(l.image,/linear-gradient/);assert.equal(l.padLeft,31);assert.match(l.size,/50\.0% 70%/);
 assert.equal(cfLayers([9,'url(javascript:1)',true],null,1),null);assert.equal(cfLayers([NaN,'#638EC6',true],null,1),null);
 assert.match(cfLayers([7,'#638EC6',false],null,1)!.size,/^100\.0%/);assert.equal(cfLayers(null,['3Arrows',9],1),null);assert.equal(cfLayers(null,['3Arrows',0],Infinity)!.padLeft,18);
});
