import test from 'node:test';import assert from 'node:assert/strict';
import {defaultOnion,normalizeOnion,ghostFrames,MAX_GHOSTS,MAX_STEP} from './onion';
import {frameToTick} from './time';
const fps={num:24,den:1},dur=frameToTick(48,fps);
test('is off by default and gives no ghosts',()=>{assert.equal(defaultOnion().on,false);assert.deepEqual(ghostFrames(defaultOnion(),frameToTick(10,fps),fps,dur),[]);});
test('normalizes junk and clamps',()=>{
  assert.deepEqual(normalizeOnion(null),defaultOnion());
  const o=normalizeOnion({on:true,before:99,after:-3,step:1000});
  assert.deepEqual(o,{...defaultOnion(),on:true,before:MAX_GHOSTS,after:0,step:MAX_STEP});
  assert.equal(normalizeOnion({on:'yes',before:NaN}).on,false);
 });
test('lists nearest-first ghosts with fading opacity',()=>{
  const g=ghostFrames({...defaultOnion(),on:true,before:2,after:1,step:2},frameToTick(10,fps),fps,dur);
  assert.deepEqual(g.map(x=>[x.side,x.n,x.tick]),[['before',1,frameToTick(8,fps)],['before',2,frameToTick(6,fps)],['after',1,frameToTick(12,fps)]]);
  assert.ok(g[0].opacity>g[1].opacity);
 });
test('skips frames outside the composition',()=>{
  const g=ghostFrames({...defaultOnion(),on:true,before:3,after:3,step:1},frameToTick(1,fps),fps,dur);
  assert.equal(g.filter(x=>x.side==='before').length,1);
  assert.deepEqual(ghostFrames({...defaultOnion(),on:true,before:0,after:2,step:1},frameToTick(47,fps),fps,dur),[]);
 });
import {layerOnlyComp} from './onion';
import type {Composition,Layer} from './model';
const L=(id:string,parent:string|null,extra:object={})=>({id,name:id,kind:'shape',parent,visible:true,solo:true,...extra}) as unknown as Layer;
const C=(layers:Layer[])=>({layers} as unknown as Composition);
test('onion polish: defaults and clamps',()=>{
  assert.deepEqual(normalizeOnion({on:true}),{on:true,before:2,after:1,step:1,selectedOnly:false,opacity:40,tint:true});
  assert.equal(normalizeOnion({opacity:5}).opacity,10);assert.equal(normalizeOnion({opacity:500}).opacity,80);assert.equal(normalizeOnion({tint:false}).tint,false);
  const g=ghostFrames({on:true,before:1,after:0,step:1,selectedOnly:false,opacity:60,tint:true},frameToTick(10,fps),fps,dur);assert.equal(g[0].opacity,0.6);
});
test('layerOnlyComp keeps the layer, hides its parents, adds the matte source',()=>{
  const c=C([L('a',null),L('b','a'),L('c','b',{matte:{source:'z'}}),L('z',null),L('x',null)]);
  const o=layerOnlyComp(c,'c');assert.deepEqual(o.layers.map(l=>l.id),['a','b','c','z']);
  assert.deepEqual(o.layers.map(l=>l.visible),[false,false,true,true]);assert.equal(o.layers[0].solo,false);
  assert.equal(layerOnlyComp(c,'nope'),c);assert.equal(layerOnlyComp(c,null),c);
});
test('layerOnlyComp survives a parent cycle',()=>{const o=layerOnlyComp(C([L('a','b'),L('b','a')]),'a');assert.deepEqual(o.layers.map(l=>l.id).sort(),['a','b']);});
