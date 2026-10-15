import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dashArrayFor,dashPresetOf,DASH_PRESETS} from './strokeStyle';
import {exportSvg} from '../vectorio';
import {rectPath} from './shapes';
import * as S from './session';
test('dash presets scale with width, round-trip, and reject bad input',()=>{
  assert.deepEqual(dashArrayFor('solid',4),[]);assert.deepEqual(dashArrayFor('dashed',2),[6,4]);assert.deepEqual(dashArrayFor('dotted',0.2),[1,2]);assert.deepEqual(dashArrayFor('dashDot',1),[3,2,1,2]);
  for(const p of DASH_PRESETS)for(const w of [0,0.5,1,3,10])assert.equal(dashPresetOf(dashArrayFor(p,w),w),p);
  assert.equal(dashPresetOf([5,5,5],2),'custom');assert.equal(dashPresetOf(undefined,2),'solid');
  assert.throws(()=>dashArrayFor('wavy' as never,1),/Unknown/);assert.throws(()=>dashArrayFor('dashed',NaN),/not valid/);assert.throws(()=>dashArrayFor('dashed',-1),/not valid/);
});
test('stroke details commit as one undo step and reach the exported SVG',()=>{
  S.resetVectorSession();S.createBlankVector();S.addPath(rectPath({x:0,y:0,w:50,h:50}));S.select([S.getVectorSession().doc.paths[0].id]);
  const before=structuredClone(S.getVectorSession().doc);
  S.setStyle({stroke:'#112233',strokeWidth:2,dashArray:dashArrayFor('dashed',2),dashOffset:3,miterLimit:8,fillOpacity:0.5,strokeOpacity:0.25});
  const svg=S.toSvg();for(const frag of ['stroke-dasharray="6 4"','stroke-dashoffset="3"','stroke-miterlimit="8"','fill-opacity="0.5"','stroke-opacity="0.25"'])assert.ok(svg.includes(frag),frag);
  S.undo();assert.deepEqual(S.getVectorSession().doc,before);
});
