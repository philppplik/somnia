import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer,validateDocument,TEXT_FONTS,textFontStack,type AnimationDocument,type Vec2} from './model';
import {applyEdit,applyEdits} from './edit';
import {invertMatrix,worldMatrix} from './scene';
import {evaluate} from './interpolate';
import {easePresetOf,EASE_PRESETS} from './graph';
import {frameSvg} from './exportFrames';
import {TICKS_PER_SECOND as sec} from './time';
const comp=(d:AnimationDocument)=>findComp(d)!;
const layer=(d:AnimationDocument,id='shape')=>findLayer(comp(d),id)!;
const close=(a:readonly number[],b:readonly number[])=>a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<1e-6,`${x} != ${b[i]}`));
const withText=()=>applyEdit(createDocument(),{type:'layer.add',kind:'text',id:'title'});
const withNull=()=>applyEdits(createDocument(),[{type:'layer.add',kind:'shape',id:'shape'},{type:'layer.add',kind:'null',id:'rig'},{type:'prop.set',layer:'rig',prop:'position',value:[100,300],t:0}]);

test('text font comes from a bounded allowlist of safe system stacks',()=>{
 let d=withText();assert.equal(layer(d,'title').source.font,undefined);
 d=applyEdit(d,{type:'layer.update',layer:'title',source:{font:'serif'}});
 assert.equal(layer(d,'title').source.font,'serif');
 assert.equal(textFontStack('serif'),TEXT_FONTS.serif.stack);
 assert.equal(textFontStack(undefined),TEXT_FONTS.system.stack);
 assert.throws(()=>applyEdit(d,{type:'layer.update',layer:'title',source:{font:'Comic Sans MS' as never}}),/Invalid layer source/);
 assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(d))),[]);
});
test('font id survives a snapshot round trip and renders as its CSS stack',()=>{
 let d=applyEdit(withText(),{type:'layer.update',layer:'title',source:{font:'mono'}});
 const svg=frameSvg(comp(d),0);assert.ok(svg.includes(`font-family="${TEXT_FONTS.mono.stack}"`));
 const plain=frameSvg(comp(withText()),0);assert.ok(plain.includes(`font-family="${TEXT_FONTS.system.stack}"`));
 const revived=JSON.parse(JSON.stringify(d)) as AnimationDocument;assert.deepEqual(validateDocument(revived),[]);
 assert.ok(frameSvg(comp(revived),0).includes(TEXT_FONTS.mono.stack));
});
test('easePresetOf names presets and custom curves, shared and per channel',()=>{
 const key=(interp:'hold'|'linear'|'bezier',out:readonly [number,number]=[0.33,0],inn:readonly [number,number]=[0.67,1])=>({t:0,v:0,interp,out,in:inn}) as const;
 assert.equal(easePresetOf(key('linear')),'linear');assert.equal(easePresetOf(key('hold')),'hold');
 assert.equal(easePresetOf(key('bezier')),'ease');
 assert.equal(easePresetOf(key('bezier',EASE_PRESETS.easeIn.out,EASE_PRESETS.easeIn.in)),'easeIn');
 assert.equal(easePresetOf(key('bezier',EASE_PRESETS.easeOut.out,EASE_PRESETS.easeOut.in)),'easeOut');
 assert.equal(easePresetOf(key('bezier',[0.2,0.4],[0.6,0.8])),'custom');
 const ch={t:0,v:[0,0] as Vec2,interp:'bezier' as const,out:[0.33,0] as const,in:[0.67,1] as const,channelOut:[[0.42,0],[0,0]] as const,channelIn:[[1,1],[0.58,1]] as const};
 assert.equal(easePresetOf(ch,0),'easeIn');assert.equal(easePresetOf(ch,1),'easeOut');assert.equal(easePresetOf(ch),'ease');
});
test('keep-world reparent preserves the world pose at t for animated parents and children',()=>{
 // Animated parent (position and rotation keys): static child keeps its world pose at the reparent time.
 let d=applyEdits(withNull(),[{type:'prop.animate',layer:'rig',prop:'position',on:true,t:0},{type:'prop.set',layer:'rig',prop:'position',value:[500,300],t:sec*2},{type:'prop.animate',layer:'rig',prop:'rotation',on:true,t:0},{type:'prop.set',layer:'rig',prop:'rotation',value:45,t:sec*2},{type:'prop.set',layer:'shape',prop:'position',value:[300,350],t:0}]);
 const t=sec;const before=worldMatrix(comp(d),layer(d),t);
 d=applyEdit(d,{type:'layer.parent',layer:'shape',parent:'rig',keepWorld:true,t});
 close(worldMatrix(comp(d),layer(d),t),before);
 // The child now follows the parent: at another time the world pose differs.
 const other=worldMatrix(comp(d),layer(d),0);assert.ok(Math.abs(other[4]-worldMatrix(comp(withNull()),layer(withNull()),0)[4])>1);
 // Animated child (position keys) onto a static parent: a key at t is inserted and the pose at t is kept.
 d=applyEdits(withNull(),[{type:'prop.animate',layer:'shape',prop:'position',on:true,t:0},{type:'prop.set',layer:'shape',prop:'position',value:[400,230],t:sec*2}]);
 const before2=worldMatrix(comp(d),layer(d),sec);
 d=applyEdit(d,{type:'layer.parent',layer:'shape',parent:'rig',keepWorld:true,t:sec});
 close(worldMatrix(comp(d),layer(d),sec),before2);
 const keys=layer(d).transform.position.keys;assert.equal(keys.length,3);assert.ok(keys.some(k=>k.t===sec));
 // Detaching with keep-world preserves the pose at t as well.
 const before3=worldMatrix(comp(d),layer(d),sec);
 d=applyEdit(d,{type:'layer.parent',layer:'shape',parent:null,keepWorld:true,t:sec});
 close(worldMatrix(comp(d),layer(d),sec),before3);
 assert.deepEqual(validateDocument(d),[]);
});
test('keep-world rewrites the key at t in place and re-expresses spatial tangents in the new space',()=>{
 // Rotated parent: a position key exactly at t keeps its easing, and its spatial tangents are rotated exactly.
 let d=applyEdits(withNull(),[{type:'prop.set',layer:'rig',prop:'rotation',value:90,t:0},{type:'prop.set',layer:'rig',prop:'scale',value:[200,200],t:0}]);
 d=applyEdits(d,[{type:'prop.animate',layer:'shape',prop:'position',on:true,t:0},{type:'prop.set',layer:'shape',prop:'position',value:[300,300],t:sec},{type:'key.spatial',layer:'shape',prop:'position',t:0,sOut:[60,0]}]);
 const before=worldMatrix(comp(d),layer(d),0);const rigInv=invertMatrix(worldMatrix(comp(d),layer(d,'rig'),0))!;
 d=applyEdit(d,{type:'layer.parent',layer:'shape',parent:'rig',keepWorld:true,t:0});
 close(worldMatrix(comp(d),layer(d),0),before);
 const key=layer(d).transform.position.keys.find(k=>k.t===0)!;
 assert.ok(key.sOut);const expected:Vec2=[rigInv[0]*60+rigInv[2]*0,rigInv[1]*60+rigInv[3]*0];
 close(key.sOut!,expected);assert.equal(key.interp,'bezier');
});
test('keep-world refuses per-channel ease under a rotated parent and keeps it when axis-aligned',()=>{
 let d=applyEdits(withNull(),[{type:'prop.set',layer:'rig',prop:'rotation',value:30,t:0}]);
 d=applyEdits(d,[{type:'prop.animate',layer:'shape',prop:'position',on:true,t:0},{type:'prop.set',layer:'shape',prop:'position',value:[300,300],t:sec},{type:'key.interp',layer:'shape',prop:'position',t:0,interp:'bezier',channel:0,out:[0.5,0]}]);
 assert.throws(()=>applyEdit(d,{type:'layer.parent',layer:'shape',parent:'rig',keepWorld:true,t:0}),/per-channel easing/);
 // Axis-aligned (translation only): channel ease is preserved.
 let flat=applyEdits(withNull(),[{type:'prop.animate',layer:'shape',prop:'position',on:true,t:0},{type:'prop.set',layer:'shape',prop:'position',value:[300,300],t:sec},{type:'key.interp',layer:'shape',prop:'position',t:0,interp:'bezier',channel:0,out:[0.5,0]}]);
 flat=applyEdit(flat,{type:'layer.parent',layer:'shape',parent:'rig',keepWorld:true,t:0});
 const key=layer(flat).transform.position.keys.find(k=>k.t===0)!;assert.ok(key.channelOut);assert.equal((evaluate(layer(flat).transform.position,0) as Vec2)[0],(layer(flat).transform.position.keys[0].v as Vec2)[0]);
});
