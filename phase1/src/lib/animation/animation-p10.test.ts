import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer,validateDocument,MAX_LAYER_MASKS,type AnimationDocument} from './model';
import {applyEdit,applyEdits,EditError} from './edit';
import {readFileSync} from 'node:fs';
import {morphPath,morphProblem,resamplePath,MorphError,maskEdit,matteEdit,maskPath,copyMaskKey,insertPoint,handleMaskKey,copyMaskKeys} from './masks';
import {animatedChars,animatorEdit,defaultAnimator,mixHex} from './textAnimators';
import {copyTransformKeys,pasteTransformEdits} from './keysClipboard';
import {animatedTargets,allTargetKeys,propertyOf,moveTargetKeys,easeTargetKeys,pruneTargetKeys,toggleTargetKey,editTargetKeys,copyTargetKeys,pasteTargetKeys,deleteTargetKeys,pasteClipOnTargets,staggerLayers,bounceClip,bounceTargetKeys} from './keyTargets';
import {EASE_PRESETS,easePresetOf} from './graph';
import {animationCommandSpecs} from './commands';
import {booleanRings,flattenRing,ringArea,type BoolOp,type Pt} from './pathBoolean';
import {booleanEdits,maskBooleanEdit,expandStrokeEdits} from './pathLayer';
import {strokeOutline,simplifyRing} from './pathBoolean';
import {deleteEasingEdit,findEasing,saveEasingEdit,userEasings,validateEasingLib,MAX_EASINGS} from './easingLibrary';
import {elasticTargetKeys} from './keyTargets';
import {BUILTIN_MOTIONS,MAX_USER_MOTIONS,LEGACY_KEY,deleteMotionEdit,exportMotionsJson,findMotion,legacyMotions,listMotions,mergeMotionsEdit,motionEdits,motionFromKeys,parseMotionsJson,saveMotionEdit,userMotions,validMotion} from './motionLibrary';
import {serializeAnimationSnapshot,parseAnimationSnapshot} from './persistence';
import {defaultView} from './recovery';
import {frameToTick,TICKS_PER_SECOND as TICK_SEC} from './time';
import {frameSvg} from './exportFrames';
import {sceneAt} from './scene';
const comp=(d:AnimationDocument)=>findComp(d)!;
const layer=(d:AnimationDocument,id:string)=>findLayer(comp(d),id)!;
const base=()=>applyEdits(createDocument(),[{type:'layer.add',kind:'solid',id:'photo',over:{source:{color:'#ffb347',width:300,height:200}}},{type:'layer.add',kind:'shape',id:'stencil',over:{source:{shape:'ellipse',width:200,height:120,color:'#ffffff'}}},{type:'layer.add',kind:'text',id:'title',over:{source:{text:'ABCDEFGHIJ',size:40,color:'#ffffff'}}}]);

test('masks: add/update/remove are edits, bounded and validated',()=>{
 let d=base();
 for(let i=0;i<MAX_LAYER_MASKS;i++)d=applyEdit(d,maskEdit(d,'photo',{op:'add',id:`m${i}`}));
 assert.equal(layer(d,'photo').masks!.length,MAX_LAYER_MASKS);
 assert.throws(()=>maskEdit(d,'photo',{op:'add'}),/At most/);
 assert.throws(()=>applyEdit(d,maskEdit(d,'photo',{op:'update',mask:'m0',patch:{feather:500}})),EditError);
 assert.throws(()=>applyEdit(d,maskEdit(d,'photo',{op:'update',mask:'m0',patch:{width:0}})),EditError);
 assert.throws(()=>applyEdit(d,maskEdit(d,'photo',{op:'update',mask:'m0',patch:{x:1e9}})),EditError);
 assert.throws(()=>maskEdit(d,'photo',{op:'remove',mask:'ghost'}),/no longer exists/);
 d=applyEdit(d,maskEdit(d,'photo',{op:'remove',mask:'m0'}));assert.equal(layer(d,'photo').masks!.length,MAX_LAYER_MASKS-1);
 const n=applyEdit(createDocument(),{type:'layer.add',kind:'null',id:'n'});
 assert.throws(()=>maskEdit(n,'n',{op:'add'}),/drawable/);
 assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(d))),[]);
});
test('masks render as an SVG mask with feather, subtract and invert',()=>{
 let d=base();
 d=applyEdit(d,{type:'layer.masks',layer:'photo',masks:[{id:'a',shape:'ellipse',mode:'add',x:10,y:10,width:100,height:80,feather:4,invert:false},{id:'b',shape:'rect',mode:'subtract',x:20,y:20,width:30,height:30,feather:0,invert:true}]});
 const svg=frameSvg(comp(d),0);
 const i=comp(d).layers.indexOf(layer(d,'photo'));
 assert.ok(svg.includes(`<mask id="lmask-${i}"`)&&svg.includes(`mask="url(#lmask-${i})"`));
 assert.ok(svg.includes('stdDeviation="4"'));
 assert.equal((svg.match(/fill-rule="evenodd"/g)??[]).length,2);
 assert.equal(frameSvg(comp(d),0),svg);
 assert.ok(maskPath({id:'x',shape:'rect',mode:'add',x:1,y:2,width:3,height:4,feather:0,invert:true},{x:-9,y:-9,w:30,h:30}).startsWith('M-9 -9'));
 assert.ok(!frameSvg(comp(base()),0).includes('<mask'));
});
test('track matte: source hidden, modes and invert produce distinct masks, validated',()=>{
 let d=base();
 d=applyEdit(d,matteEdit(d,'photo','stencil','alpha',false));
 assert.ok(!sceneAt(comp(d),0).some(x=>x.layer.id==='stencil'));
 const i=comp(d).layers.indexOf(layer(d,'photo'));
 const render=(mode:'alpha'|'luma',invert:boolean)=>frameSvg(comp(applyEdit(d,matteEdit(d,'photo','stencil',mode,invert))),0);
 const a=render('alpha',false),ai=render('alpha',true),l=render('luma',false),li=render('luma',true);
 assert.ok(a.includes('mask-type="alpha"')&&a.includes(`mask="url(#lmatte-${i})"`));
 assert.ok(!ai.includes('mask-type="alpha"')&&ai.includes(`lmatte-${i}-inv`));
 assert.ok(l.includes('fill="#000"')&&!l.includes('-inv"'));
 assert.ok(li.includes('values="-1 0 0 0 1'));
 assert.equal(new Set([a,ai,l,li]).size,4);
 assert.throws(()=>applyEdit(d,matteEdit(d,'photo','photo')),EditError);
 assert.throws(()=>applyEdit(d,matteEdit(d,'photo','ghost')),EditError);
 const m=applyEdit(d,matteEdit(d,'photo','stencil'));
 assert.throws(()=>applyEdit(m,matteEdit(m,'stencil','title')),EditError);
 assert.throws(()=>applyEdit(m,matteEdit(m,'title','photo')),EditError);
 const rm=applyEdit(m,{type:'layer.remove',layer:'stencil'});assert.equal(layer(rm,'photo').matte,undefined);assert.deepEqual(validateDocument(rm),[]);
 assert.equal(layer(applyEdit(m,matteEdit(m,'photo',null)),'photo').matte,undefined);
 assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(m))),[]);
});
test('text animators gain rotation and colour, bounded',()=>{
 let d=base();d=applyEdit(d,{type:'text.animators',layer:'title',animators:[{...defaultAnimator('a'),start:0,end:50,softness:0,position:[0,0],scale:100,opacity:100,rotation:90,color:'#ff0000'}]});
 const s=animatedChars(layer(d,'title'),'ABCDEFGHIJ',0)!;
 assert.equal(s[0].rotate,90);assert.equal(s[0].fill,'#ff0000');assert.equal(s[9].rotate,0);assert.equal(s[9].fill,undefined);
 const svg=frameSvg(comp(d),0);assert.ok(svg.includes('rotate="90"')&&svg.includes('fill="#ff0000"'));
 assert.equal(mixHex('#000000','#ff0000',0.5),'#800000');
 d=applyEdit(d,animatorEdit(d,'title',{op:'update',animator:'a',patch:{color:null,rotation:0}}));
 assert.equal(layer(d,'title').animators![0].color,undefined);
 assert.throws(()=>applyEdit(d,animatorEdit(d,'title',{op:'update',animator:'a',patch:{rotation:9999}})),EditError);
 assert.throws(()=>applyEdit(d,animatorEdit(d,'title',{op:'update',animator:'a',patch:{color:'red'}})),EditError);
});

import {resolveMask,bezierPath,smoothPath,setMaskValue,animateMask} from './masks';
import {TICKS_PER_SECOND as sec} from './time';
test('P11: keyed mask position, size, feather and opacity are evaluated per tick and render per frame',()=>{
 let d=base();d=applyEdit(d,maskEdit(d,'photo',{op:'add',id:'m'}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'animate',mask:'m',prop:'position',on:true,t:0}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'set',mask:'m',prop:'position',value:[100,40],t:sec}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'animate',mask:'m',prop:'opacity',on:true,t:0}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'set',mask:'m',prop:'opacity',value:20,t:sec}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'animate',mask:'m',prop:'feather',on:true,t:0}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'set',mask:'m',prop:'feather',value:10,t:sec}));
 const m=layer(d,'photo').masks![0];
 const half=resolveMask(m,sec/2);
 assert.ok(half.x>m.x&&half.x<100&&half.opacity!<100&&half.opacity!>20&&half.feather>0&&half.feather<10);
 assert.deepEqual([resolveMask(m,sec).x,resolveMask(m,sec).y,resolveMask(m,sec).opacity,resolveMask(m,sec).feather],[100,40,20,10]);
 assert.notEqual(frameSvg(comp(d),0),frameSvg(comp(d),sec));
 assert.ok(frameSvg(comp(d),sec).includes('fill-opacity="0.2"')&&frameSvg(comp(d),sec).includes('stdDeviation="10"'));
 assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(d))),[]);
 // static set when not animated, animate off bakes the value at t
 const flat=applyEdit(d,maskEdit(d,'photo',{op:'animate',mask:'m',prop:'position',on:false,t:sec}));
 assert.equal(layer(flat,'photo').masks![0].x,100);assert.equal(layer(flat,'photo').masks![0].anim?.position,undefined);
 assert.throws(()=>maskEdit(d,'photo',{op:'set',mask:'m',prop:'opacity',value:[1,2],t:0}).type&&applyEdit(d,maskEdit(d,'photo',{op:'set',mask:'m',prop:'opacity',value:[1,2] as never,t:0})),/fit/);
 assert.throws(()=>applyEdit(d,maskEdit(d,'photo',{op:'set',mask:'m',prop:'opacity',value:500,t:sec})),EditError);
 assert.throws(()=>maskEdit(d,'photo',{op:'set',mask:'m',prop:'position',value:[0,0],t:comp(d).duration+1000}),/outside/);
 assert.equal(setMaskValue(m,'opacity',50,0).anim!.opacity!.keys.length>=1,true);
 assert.equal(animateMask({...m,anim:undefined},'size',false,0).anim,undefined);
});
test('P11: path masks are bounded beziers with straight corners or smooth handles',()=>{
 let d=base();d=applyEdit(d,maskEdit(d,'photo',{op:'add',id:'p'}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'path',mask:'p',points:[{x:0,y:0},{x:100,y:0},{x:50,y:90}],closed:true,smooth:false}));
 let m=layer(d,'photo').masks![0];assert.equal(m.shape,'path');
 assert.equal(bezierPath(m.path!,0,0),'M0 0C0 0 100 0 100 0C100 0 50 90 50 90C50 90 0 0 0 0Z');
 const smooth=smoothPath(m.path!.points,true,true);assert.ok(smooth.points.every(q=>q.inX!==undefined&&q.outX!==undefined));
 d=applyEdit(d,maskEdit(d,'photo',{op:'path',mask:'p',points:m.path!.points,closed:true,smooth:true}));
 assert.ok(frameSvg(comp(d),0).includes('C'));
 const open=smoothPath([{x:0,y:0},{x:10,y:10}],false,true);assert.equal(open.points[0].inX,undefined);assert.equal(open.points[1].outX,undefined);
 assert.throws(()=>maskEdit(d,'photo',{op:'path',mask:'p',points:Array.from({length:33},(_,i)=>({x:i,y:i})),closed:false,smooth:false}),/At most/);
 assert.throws(()=>applyEdit(d,maskEdit(d,'photo',{op:'path',mask:'p',points:[],closed:false,smooth:false})),EditError);
 assert.throws(()=>applyEdit(d,maskEdit(d,'photo',{op:'path',mask:'p',points:[{x:0,y:0},{x:1,y:1}],closed:true,smooth:false})),EditError);
 assert.throws(()=>applyEdit(d,maskEdit(d,'photo',{op:'path',mask:'p',points:[{x:0,y:0},{x:1e9,y:1}],closed:false,smooth:false})),EditError);
 d=applyEdit(d,maskEdit(d,'photo',{op:'update',mask:'p',patch:{shape:'rect'}}));assert.equal(layer(d,'photo').masks![0].path,undefined);
 d=applyEdit(d,maskEdit(d,'photo',{op:'update',mask:'p',patch:{shape:'path'}}));assert.equal(layer(d,'photo').masks![0].path!.points.length,4);
 assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(d))),[]);
});

import {moveMaskKey,removeMaskKey,easeMaskKey} from './masks';
import {maskBox,moveBox,resizeBox,corners} from './maskHandles';
import {selectMask,activeMask} from './maskSelection';
const keyed=()=>{let d=base();d=applyEdit(d,maskEdit(d,'photo',{op:'add',id:'m'}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'animate',mask:'m',prop:'position',on:true,t:0}));
 return applyEdit(d,maskEdit(d,'photo',{op:'set',mask:'m',prop:'position',value:[100,40],t:sec}));};
test('P12: mask keys move, delete and take eases as single edits',()=>{
 let d=keyed();const keys=()=>layer(d,'photo').masks![0].anim?.position?.keys.map(k=>k.t)??[];
 d=applyEdit(d,maskEdit(d,'photo',{op:'keyMove',mask:'m',prop:'position',from:sec,to:2*sec}));assert.deepEqual(keys(),[0,2*sec]);
 assert.throws(()=>maskEdit(d,'photo',{op:'keyMove',mask:'m',prop:'position',from:2*sec,to:0}),/already/);
 assert.throws(()=>maskEdit(d,'photo',{op:'keyMove',mask:'m',prop:'position',from:2*sec,to:comp(d).duration+sec}),/outside/);
 assert.throws(()=>maskEdit(d,'photo',{op:'keyMove',mask:'m',prop:'position',from:123,to:5}),/no longer/);
 assert.throws(()=>maskEdit(d,'photo',{op:'keyMove',mask:'m',prop:'feather',from:0,to:5}),/no keys/);
 d=applyEdit(d,maskEdit(d,'photo',{op:'keyEase',mask:'m',prop:'position',t:0,preset:'easeIn'}));
 const k0=layer(d,'photo').masks![0].anim!.position!.keys[0];assert.equal(k0.interp,'bezier');assert.deepEqual([...k0.out],[0.42,0]);
 d=applyEdit(d,maskEdit(d,'photo',{op:'keyEase',mask:'m',prop:'position',t:0,preset:'hold'}));assert.equal(layer(d,'photo').masks![0].anim!.position!.keys[0].interp,'hold');
 d=applyEdit(d,maskEdit(d,'photo',{op:'keyRemove',mask:'m',prop:'position',t:0}));assert.deepEqual(keys(),[2*sec]);
 d=applyEdit(d,maskEdit(d,'photo',{op:'keyRemove',mask:'m',prop:'position',t:2*sec}));
 const m=layer(d,'photo').masks![0];assert.equal(m.anim,undefined);assert.deepEqual([m.x,m.y],[100,40]);
 assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(d))),[]);
 const mm=layer(keyed(),'photo').masks![0];assert.equal(moveMaskKey(mm,'position',0,sec/2,comp(keyed())).anim!.position!.keys[0].t,sec/2);
 assert.equal(removeMaskKey(mm,'position',0).anim!.position!.keys.length,1);assert.equal(easeMaskKey(mm,'position',0,'linear').anim!.position!.keys[0].interp,'linear');
});
test('P12: box and point drags are single edits; handle maths is bounded',()=>{
 let d=keyed();
 d=applyEdit(d,maskEdit(d,'photo',{op:'box',mask:'m',x:10,y:20,width:50,height:60,t:sec}));
 const m=layer(d,'photo').masks![0];assert.deepEqual([m.width,m.height],[50,60]);assert.deepEqual(m.anim!.position!.keys.find(k=>k.t===sec)!.v,[10,20]);
 assert.equal(d.revision,keyed().revision+1);
 assert.throws(()=>applyEdit(d,maskEdit(d,'photo',{op:'box',mask:'m',x:0,y:0,width:0,height:5,t:0})),EditError);
 const b={x:10,y:10,width:100,height:50};
 assert.deepEqual(resizeBox(b,'se',20,10),{x:10,y:10,width:120,height:60});
 assert.deepEqual(resizeBox(b,'nw',20,10),{x:30,y:20,width:80,height:40});
 assert.deepEqual(resizeBox(b,'nw',500,500),{x:109,y:59,width:1,height:1});
 assert.equal(resizeBox(b,'se',1e9,0).width,16384);
 assert.deepEqual(moveBox(b,5.26,-3),{x:15.3,y:7,width:100,height:50});
 assert.deepEqual(corners(b).sw,[10,60]);
 let p=applyEdit(base(),maskEdit(base(),'photo',{op:'add',id:'p'}));
 p=applyEdit(p,maskEdit(p,'photo',{op:'path',mask:'p',points:[{x:0,y:0},{x:50,y:0},{x:25,y:40}],closed:true,smooth:false}));
 const moved=applyEdit(p,maskEdit(p,'photo',{op:'point',mask:'p',index:1,x:70.123456,y:5}));
 assert.deepEqual(layer(moved,'photo').masks![0].path!.points[1],{x:70.1235,y:5});
 assert.throws(()=>maskEdit(p,'photo',{op:'point',mask:'p',index:9,x:0,y:0}).type&&applyEdit(p,maskEdit(p,'photo',{op:'point',mask:'p',index:9,x:0,y:0})),/no longer/);
 assert.deepEqual(maskBox(layer(p,'photo').masks![0]),{x:75,y:50,width:50,height:40});
});
test('P12: mask selection falls back to the first mask of the layer',()=>{
 const d=keyed();const l=layer(d,'photo');
 selectMask(null,null);assert.equal(activeMask(l,{layer:null,mask:null,point:null,pen:false,layerPen:false,layerPoint:null,layerSet:null,clip:null,graph:null,mixed:false})!.id,'m');
 assert.equal(activeMask(l,{layer:'other',mask:'zzz',point:null,pen:false,layerPen:false,layerPoint:null,layerSet:null,clip:null,graph:null,mixed:false})!.id,'m');assert.equal(activeMask(undefined,{layer:null,mask:null,point:null,pen:false,layerPen:false,layerPoint:null,layerSet:null,clip:null,graph:null,mixed:false}),undefined);
});

const penned=()=>{let d=base();d=applyEdit(d,maskEdit(d,'photo',{op:'add',id:'p'}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'pen',mask:'p',x:0,y:0,restart:true}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'pen',mask:'p',x:100,y:0,outX:20,outY:30}));
 return applyEdit(d,maskEdit(d,'photo',{op:'pen',mask:'p',x:100,y:80}));};
test('P13: pen adds points with mirrored handles, closes, and stays bounded',()=>{
 let d=penned();const m=()=>layer(d,'photo').masks![0];
 assert.equal(m().shape,'path');assert.equal(m().path!.points.length,3);assert.deepEqual([m().path!.points[1].outX,m().path!.points[1].inX],[20,-20]);
 assert.equal(m().path!.points[2].outX,undefined);
 d=applyEdit(d,maskEdit(d,'photo',{op:'close',mask:'p'}));assert.equal(m().path!.closed,true);
 assert.throws(()=>applyEdit(d,maskEdit(d,'photo',{op:'pen',mask:'p',x:5,y:5})));
 d=applyEdit(d,maskEdit(d,'photo',{op:'pen',mask:'p',x:7,y:7,restart:true}));assert.equal(m().path!.points.length,1);assert.equal(m().path!.closed,false);
 assert.throws(()=>applyEdit(d,maskEdit(d,'photo',{op:'close',mask:'p'})));
 let e=penned();for(let i=0;i<40;i++){try{e=applyEdit(e,maskEdit(e,'photo',{op:'pen',mask:'p',x:i,y:i}));}catch{break;}}
 assert.equal(layer(e,'photo').masks![0].path!.points.length,32);assert.deepEqual(validateDocument(e),[]);
});
test('P13: handle drag mirrors unless broken, and is one edit',()=>{
 let d=penned();const r=d.revision;
 d=applyEdit(d,maskEdit(d,'photo',{op:'handle',mask:'p',index:2,which:'out',x:10,y:-5,mirror:true}));
 let q=layer(d,'photo').masks![0].path!.points[2];assert.deepEqual([q.outX,q.outY,q.inX,q.inY],[10,-5,-10,5]);assert.equal(d.revision,r+1);
 d=applyEdit(d,maskEdit(d,'photo',{op:'handle',mask:'p',index:2,which:'in',x:3,y:3,mirror:false}));
 q=layer(d,'photo').masks![0].path!.points[2];assert.deepEqual([q.outX,q.inX],[10,3]);
 assert.throws(()=>applyEdit(d,maskEdit(d,'photo',{op:'handle',mask:'p',index:9,which:'in',x:0,y:0,mirror:true})));
});
test('P13: path morph keys interpolate, edits write keys at the playhead, last key bakes',()=>{
 let d=applyEdit(penned(),maskEdit(penned(),'photo',{op:'close',mask:'p'}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'pathAnimate',mask:'p',on:true,t:0}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'point',mask:'p',index:2,x:300,y:200,t:sec}));
 let m=layer(d,'photo').masks![0];assert.equal(m.shapeKeys!.length,2);assert.deepEqual(validateDocument(d),[]);
 assert.deepEqual([m.shapeKeys![0].path.points[2].x,m.shapeKeys![1].path.points[2].x],[100,300]);
 const mid=resolveMask(m,Math.round(sec/2)).path!.points[2];assert.ok(mid.x>100&&mid.x<300);
 assert.equal(resolveMask(m,sec*2).path!.points[2].x,300);
 assert.throws(()=>applyEdit(d,maskEdit(d,'photo',{op:'pen',mask:'p',x:1,y:1})));
 assert.throws(()=>applyEdit(d,maskEdit(d,'photo',{op:'path',mask:'p',points:[{x:0,y:0},{x:1,y:1}],closed:false,smooth:false})));
 d=applyEdit(d,maskEdit(d,'photo',{op:'keyMove',mask:'p',prop:'path',from:sec,to:sec+Math.round(sec/2)}));
 m=layer(d,'photo').masks![0];assert.ok(m.shapeKeys![1].t>sec);
 const svgA=frameSvg(comp(d),0,false,d.assets),svgB=frameSvg(comp(d),sec*2,false,d.assets);assert.notEqual(svgA,svgB);
 d=applyEdit(d,maskEdit(d,'photo',{op:'keyRemove',mask:'p',prop:'path',t:m.shapeKeys![1].t}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'keyRemove',mask:'p',prop:'path',t:0}));
 m=layer(d,'photo').masks![0];assert.equal(m.shapeKeys,undefined);assert.equal(m.path!.points.length,3);assert.deepEqual(validateDocument(d),[]);
});

const morph=()=>{let d=applyEdit(penned(),maskEdit(penned(),'photo',{op:'close',mask:'p'}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'pathAnimate',mask:'p',on:true,t:0}));
 return applyEdit(d,maskEdit(d,'photo',{op:'point',mask:'p',index:2,x:300,y:200,t:sec}));};
test('P14: ease per path key changes the in-between shape and round-trips',()=>{
 let d=morph();const mid=Math.round(sec/2);const xAt=(doc:AnimationDocument)=>resolveMask(layer(doc,'photo').masks![0],mid).path!.points[2].x;
 const lin=xAt(d);d=applyEdit(d,maskEdit(d,'photo',{op:'keyEase',mask:'p',prop:'path',t:0,preset:'easeIn'}));
 assert.ok(xAt(d)<lin);assert.equal(layer(d,'photo').masks![0].shapeKeys![0].ease,'easeIn');
 d=applyEdit(d,maskEdit(d,'photo',{op:'keyEase',mask:'p',prop:'path',t:0,preset:'hold'}));assert.equal(xAt(d),100);
 d=applyEdit(d,maskEdit(d,'photo',{op:'keyEase',mask:'p',prop:'path',t:0,preset:'linear'}));assert.equal(layer(d,'photo').masks![0].shapeKeys![0].ease,undefined);
 assert.throws(()=>maskEdit(d,'photo',{op:'keyEase',mask:'p',prop:'path',t:12345,preset:'ease'}).type&&applyEdit(d,maskEdit(d,'photo',{op:'keyEase',mask:'p',prop:'path',t:12345,preset:'ease'})));
 assert.deepEqual(validateDocument(d),[]);
});
test('P14: points are inserted and deleted on static and keyed paths, shape unchanged by insert',()=>{
 let d=penned();const pts=()=>layer(d,'photo').masks![0].path!.points;
 d=applyEdit(d,maskEdit(d,'photo',{op:'pointInsert',mask:'p',index:0}));assert.equal(pts().length,4);
 assert.throws(()=>maskEdit(d,'photo',{op:'pointInsert',mask:'p',index:3}),/next segment/);
 const straight=insertPoint({closed:false,points:[{x:0,y:0},{x:100,y:0}]},0).points;assert.deepEqual([straight[1].x,straight[1].y],[50,0]);
 d=applyEdit(d,maskEdit(d,'photo',{op:'pointRemove',mask:'p',index:1}));assert.equal(pts().length,3);
 d=applyEdit(d,maskEdit(d,'photo',{op:'close',mask:'p'}));
 assert.throws(()=>applyEdit(d,maskEdit(d,'photo',{op:'pointRemove',mask:'p',index:0})),/three points/);
 d=applyEdit(d,maskEdit(d,'photo',{op:'pointInsert',mask:'p',index:2}));assert.equal(pts().length,4);
 let k=morph();const r=k.revision;k=applyEdit(k,maskEdit(k,'photo',{op:'pointInsert',mask:'p',index:0}));
 const m=layer(k,'photo').masks![0];assert.equal(k.revision,r+1);assert.ok(m.shapeKeys!.every(x=>x.path.points.length===4)&&m.path!.points.length===4);assert.deepEqual(validateDocument(k),[]);
 k=applyEdit(k,maskEdit(k,'photo',{op:'pointRemove',mask:'p',index:3}));assert.ok(layer(k,'photo').masks![0].shapeKeys!.every(x=>x.path.points.length===3));
});
test('P14: masks and mask keys copy between layers; mismatches are refused',()=>{
 let d=morph();const src=layer(d,'photo').masks![0];
 d=applyEdit(d,maskEdit(d,'stencil',{op:'adopt',source:src}));const copy=layer(d,'stencil').masks![0];
 assert.notEqual(copy.id,'p');assert.equal(copy.shapeKeys!.length,2);assert.deepEqual(validateDocument(d),[]);
 const clip=copyMaskKey(src,'path',sec);
 d=applyEdit(d,maskEdit(d,'stencil',{op:'keyPaste',mask:copy.id,prop:'path',t:sec*2,clip}));assert.equal(layer(d,'stencil').masks![0].shapeKeys!.length,3);
 assert.throws(()=>maskEdit(d,'stencil',{op:'keyPaste',mask:copy.id,prop:'position',t:0,clip}),/another property/);
 const small=applyEdit(d,maskEdit(d,'stencil',{op:'pointInsert',mask:copy.id,index:0}));
 assert.throws(()=>maskEdit(small,'stencil',{op:'keyPaste',mask:copy.id,prop:'path',t:sec*3,clip}),/different number/);
 let f=applyEdit(base(),maskEdit(base(),'photo',{op:'add',id:'a'}));f=applyEdit(f,maskEdit(f,'photo',{op:'animate',mask:'a',prop:'opacity',on:true,t:0}));
 f=applyEdit(f,maskEdit(f,'photo',{op:'set',mask:'a',prop:'opacity',value:30,t:sec}));
 const kc=copyMaskKey(layer(f,'photo').masks![0],'opacity',sec);
 f=applyEdit(f,maskEdit(f,'photo',{op:'keyPaste',mask:'a',prop:'opacity',t:sec*2,clip:kc}));assert.equal(layer(f,'photo').masks![0].anim!.opacity!.keys.length,3);
 let g=f;for(let i=0;i<MAX_LAYER_MASKS;i++){try{g=applyEdit(g,maskEdit(g,'stencil',{op:'adopt',source:layer(f,'photo').masks![0]}));}catch{break;}}
 assert.ok(layer(g,'stencil').masks!.length<=MAX_LAYER_MASKS);assert.throws(()=>maskEdit(g,'stencil',{op:'adopt',source:src}));
});

test('P15: graph edits move and revalue a mask key in one edit and keep its ease',()=>{
 let d=keyed();d=applyEdit(d,maskEdit(d,'photo',{op:'animate',mask:'m',prop:'opacity',on:true,t:0}));d=applyEdit(d,maskEdit(d,'photo',{op:'set',mask:'m',prop:'opacity',value:20,t:sec}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'keyEase',mask:'m',prop:'opacity',t:sec,preset:'easeIn'}));
 const r=d.revision;d=applyEdit(d,maskEdit(d,'photo',{op:'keyEdit',mask:'m',prop:'opacity',t:sec,to:sec+4000,v:55}));
 const k=layer(d,'photo').masks![0].anim!.opacity!.keys.find(x=>x.v===55)!;assert.equal(d.revision,r+1);assert.ok(k.t>sec);assert.equal(k.interp,'bezier');assert.deepEqual([...k.out],[0.42,0]);
 assert.throws(()=>maskEdit(d,'photo',{op:'keyEdit',mask:'m',prop:'opacity',t:k.t,to:k.t,v:[1,2]}),/does not fit/);
 assert.throws(()=>maskEdit(d,'photo',{op:'keyEdit',mask:'m',prop:'opacity',t:k.t,to:0,v:5}),/Another key/);
 d=applyEdit(d,maskEdit(d,'photo',{op:'keyHandle',mask:'m',prop:'opacity',t:k.t,kind:'out',x:0.5,y:0.2}));
 assert.deepEqual([...layer(d,'photo').masks![0].anim!.opacity!.keys.find(x=>x.t===k.t)!.out],[0.5,0.2]);
 assert.throws(()=>handleMaskKey(layer(d,'photo').masks![0],'opacity',k.t,'in',[2,0]),/out of range/);
 assert.deepEqual(validateDocument(d),[]);
});

test('P16: several keys move, ease and paste as single edits; types must match',()=>{
 let d=keyed();for(const [t,v] of [[0,100],[sec,20],[sec*2,60]] as const){if(t===0)d=applyEdit(d,maskEdit(d,'photo',{op:'animate',mask:'m',prop:'opacity',on:true,t:0}));else d=applyEdit(d,maskEdit(d,'photo',{op:'set',mask:'m',prop:'opacity',value:v,t}));}
 const keys=()=>layer(d,'photo').masks![0].anim!.opacity!.keys;const r=d.revision;
 d=applyEdit(d,maskEdit(d,'photo',{op:'keysEdit',mask:'m',prop:'opacity',edits:[{t:sec,to:sec+4000,v:30},{t:sec*2,to:sec*2+4000,v:70}]}));
 assert.equal(d.revision,r+1);assert.deepEqual(keys().map(k=>k.v),[100,30,70]);assert.ok(keys()[1].t>sec);
 assert.throws(()=>maskEdit(d,'photo',{op:'keysEdit',mask:'m',prop:'opacity',edits:[{t:keys()[1].t,to:0,v:1}]}),/Another key/);
 assert.throws(()=>maskEdit(d,'photo',{op:'keysEdit',mask:'m',prop:'opacity',edits:[{t:keys()[1].t,to:5000,v:[1,2]}]}),/does not fit/);
 d=applyEdit(d,maskEdit(d,'photo',{op:'keysEase',mask:'m',prop:'opacity',ts:[keys()[1].t,keys()[2].t],preset:'easeIn'}));assert.ok(keys().slice(1).every(k=>k.interp==='bezier'));assert.equal(keys()[0].interp,'linear');
 const clip=copyMaskKeys(layer(d,'photo').masks![0],'opacity',[keys()[1].t,keys()[2].t]);assert.equal(clip.keys.length,2);assert.equal(clip.keys[0].dt,0);
 d=applyEdit(d,maskEdit(d,'photo',{op:'add',id:'n'}));d=applyEdit(d,maskEdit(d,'photo',{op:'animate',mask:'n',prop:'feather',on:true,t:0}));
 assert.throws(()=>applyEdit(d,maskEdit(d,'photo',{op:'keysPaste',mask:'n',prop:'feather',t:sec,clip})),EditError);
 const one=copyMaskKeys(layer(d,'photo').masks![0],'opacity',[keys()[1].t]);
 d=applyEdit(d,maskEdit(d,'photo',{op:'keysPaste',mask:'n',prop:'feather',t:sec,clip:one}));
 assert.deepEqual(layer(d,'photo').masks![1].anim!.feather!.keys.map(k=>k.v),[0,30]);
 assert.throws(()=>maskEdit(d,'photo',{op:'keysPaste',mask:'n',prop:'feather',t:0,clip:{...one,type:'vec2'}}),/another value type/);
});

test('P17: keys copy between transform and mask properties in one undo step; types must match',()=>{
 let d=keyed();d=applyEdit(d,maskEdit(d,'photo',{op:'animate',mask:'m',prop:'opacity',on:true,t:0}));d=applyEdit(d,maskEdit(d,'photo',{op:'set',mask:'m',prop:'opacity',value:40,t:sec}));
 const mk=layer(d,'photo').masks![0];const clip=copyMaskKeys(mk,'opacity',[0,sec]);
 const before=d;const edits=pasteTransformEdits(layer(d,'photo'),'opacity',sec,clip);d=applyEdits(d,edits);
 const tk=layer(d,'photo').transform.opacity.keys;assert.deepEqual(tk.filter(k=>k.t>=sec).map(k=>k.v),[100,40]);assert.equal(d.revision,before.revision+1);
 assert.throws(()=>pasteTransformEdits(layer(d,'photo'),'position',0,clip),/another value type/);
 const back=copyTransformKeys(layer(d,'photo'),'opacity',tk.map(k=>k.t));
 d=applyEdit(d,maskEdit(d,'photo',{op:'add',id:'z'}));d=applyEdit(d,maskEdit(d,'photo',{op:'animate',mask:'z',prop:'opacity',on:true,t:0}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'keysPaste',mask:'z',prop:'opacity',t:sec*2,clip:back}));assert.ok(layer(d,'photo').masks![1].anim!.opacity!.keys.length>=back.keys.length);
 assert.deepEqual(validateDocument(d),[]);
});

test('P18: key targets list, move and ease keys of transform and mask properties together in one undo step',()=>{
 let d=keyed();d=applyEdit(d,{type:'prop.animate',layer:'photo',prop:'opacity',on:true,t:0});d=applyEdit(d,{type:'prop.set',layer:'photo',prop:'opacity',value:30,t:sec});d=applyEdit(d,maskEdit(d,'photo',{op:'animate',mask:'m',prop:'opacity',on:true,t:0}));d=applyEdit(d,maskEdit(d,'photo',{op:'set',mask:'m',prop:'opacity',value:40,t:sec}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'animate',mask:'m',prop:'feather',on:true,t:0}));d=applyEdit(d,maskEdit(d,'photo',{op:'set',mask:'m',prop:'feather',value:8,t:sec}));
 const l=layer(d,'photo');const ts=animatedTargets(l);
 assert.ok(ts.some(g=>g.kind==='transform'&&g.prop==='opacity')&&ts.some(g=>g.kind==='mask'&&g.prop==='opacity')&&ts.some(g=>g.kind==='mask'&&g.prop==='feather'));
 const all=allTargetKeys(l);assert.equal(all.length,ts.reduce((n,g)=>n+propertyOf(l,g)!.keys.length,0));
 const pick=all.filter(r=>r.t===sec);assert.ok(pick.some(r=>r.target.kind==='mask'&&r.target.prop==='feather')&&pick.some(r=>r.target.kind==='mask'&&r.target.prop==='opacity'));
 const delta=sec/2;const rev=d.revision;const moved=applyEdits(d,moveTargetKeys(d,'photo',pick,delta));
 assert.equal(moved.revision,rev+1);const ml=layer(moved,'photo');
 assert.ok(pick.every(r=>propertyOf(ml,r.target)!.keys.some(k=>k.t===r.t+delta)&&!propertyOf(ml,r.target)!.keys.some(k=>k.t===r.t)));
 assert.deepEqual(propertyOf(ml,{kind:'mask',mask:'m',prop:'feather'})!.keys.map(k=>k.v),[propertyOf(l,{kind:'mask',mask:'m',prop:'feather'})!.keys[0].v,8]);
 const eased=applyEdits(d,easeTargetKeys(d,'photo',pick,'easeIn'));assert.equal(eased.revision,rev+1);
 assert.notEqual(propertyOf(layer(eased,'photo'),{kind:'mask',mask:'m',prop:'feather'})!.keys[1].interp,propertyOf(l,{kind:'mask',mask:'m',prop:'feather'})!.keys[1].interp);
 assert.throws(()=>applyEdits(d,moveTargetKeys(d,'photo',pick,-sec)),/./);
 assert.deepEqual(pruneTargetKeys(layer(moved,'photo'),pick),[]);
 assert.equal(toggleTargetKey([pick[0]],pick[0],true).length,0);assert.equal(toggleTargetKey([pick[0]],pick[1],true).length,2);
 assert.deepEqual(validateDocument(moved),[]);
});

test('P19: value edit, copy/paste and delete work across transform and mask properties in one undo step each',()=>{
 let d=keyed();d=applyEdit(d,{type:'prop.animate',layer:'photo',prop:'opacity',on:true,t:0});d=applyEdit(d,{type:'prop.set',layer:'photo',prop:'opacity',value:30,t:sec});
 d=applyEdit(d,maskEdit(d,'photo',{op:'animate',mask:'m',prop:'opacity',on:true,t:0}));d=applyEdit(d,maskEdit(d,'photo',{op:'set',mask:'m',prop:'opacity',value:40,t:sec}));
 const l=layer(d,'photo');const sel=allTargetKeys(l).filter(r=>r.t===sec&&(r.target.prop==='opacity'));assert.equal(sel.length,2);
 const rev=d.revision;const up=applyEdits(d,editTargetKeys(d,'photo',sel,0,()=>500));assert.equal(up.revision,rev+1);
 assert.equal(propertyOf(layer(up,'photo'),sel[0].target)!.keys.find(k=>k.t===sec)!.v,100);assert.equal(propertyOf(layer(up,'photo'),sel[1].target)!.keys.find(k=>k.t===sec)!.v,100);
 const both=applyEdits(d,editTargetKeys(d,'photo',sel,sec/2,()=>-10));assert.equal(both.revision,rev+1);
 assert.ok(sel.every(r=>propertyOf(layer(both,'photo'),r.target)!.keys.some(k=>k.t===r.t+sec/2)));
 const clip=copyTargetKeys(l,allTargetKeys(l).filter(r=>r.target.prop==='opacity'));assert.equal(clip.items.length,2);
 const pasted=applyEdits(d,pasteTargetKeys(d,'photo',sec*2,clip));assert.equal(pasted.revision,rev+1);
 assert.ok(propertyOf(layer(pasted,'photo'),sel[0].target)!.keys.some(k=>k.t===sec*2));assert.ok(propertyOf(layer(pasted,'photo'),sel[1].target)!.keys.some(k=>k.t===sec*3));
 assert.throws(()=>pasteTargetKeys(d,'photo',1e12,clip),/outside/);
 const del=applyEdits(d,deleteTargetKeys(d,'photo',sel));assert.equal(del.revision,rev+1);
 assert.ok(propertyOf(layer(del,'photo'),sel[1].target)===undefined||!propertyOf(layer(del,'photo'),sel[1].target)!.keys.some(k=>k.t===sec));
 assert.deepEqual(validateDocument(pasted),[]);assert.deepEqual(validateDocument(del),[]);
});

test('P20: spring presets, both vec2 channels, single clip paste and layer stagger',()=>{
 for(const n of ['overshoot','anticipate','spring'] as const){const e=EASE_PRESETS[n];assert.equal(e.interp,'bezier');assert.ok(Math.min(e.out[1],e.in[1])<0||Math.max(e.out[1],e.in[1])>1,'goes outside 0..1');}
 let d=keyed();d=applyEdits(d,[{type:'prop.animate',layer:'photo',prop:'position',on:true,t:0},{type:'prop.set',layer:'photo',prop:'position',value:[10,20],t:0},{type:'prop.set',layer:'photo',prop:'position',value:[50,60],t:sec}]);
 d=applyEdit(d,{type:'keys.interp',keys:[{layer:'photo',prop:'position',t:0}],interp:'bezier',out:EASE_PRESETS.spring.out,in:EASE_PRESETS.spring.in});assert.deepEqual(validateDocument(d),[]);
 assert.equal(easePresetOf(layer(d,'photo').transform.position.keys[0]),'spring');
 const sel=allTargetKeys(layer(d,'photo')).filter(r=>r.target.kind==='transform'&&r.target.prop==='position'&&r.t===sec);assert.equal(sel.length,1);
 const rev=d.revision;
 const y=applyEdits(d,editTargetKeys(d,'photo',sel,0,()=>5,1));assert.equal(y.revision,rev+1);assert.deepEqual(propertyOf(layer(y,'photo'),sel[0].target)!.keys.find(k=>k.t===sec)!.v,[50,65]);
 const x=applyEdits(d,editTargetKeys(d,'photo',sel,0,()=>5,0));assert.deepEqual(propertyOf(layer(x,'photo'),sel[0].target)!.keys.find(k=>k.t===sec)!.v,[55,60]);
 // single-property clip paste onto selected targets
 d=applyEdit(d,{type:'prop.animate',layer:'photo',prop:'opacity',on:true,t:0});d=applyEdit(d,{type:'prop.set',layer:'photo',prop:'opacity',value:30,t:sec});
 const oc=copyTransformKeys(layer(d,'photo'),'opacity',[0,sec]);const r2=d.revision;
 const pd=applyEdits(d,pasteClipOnTargets(d,'photo',[{kind:'transform',prop:'opacity'}],sec*2,oc));assert.equal(pd.revision,r2+1);assert.ok(layer(pd,'photo').transform.opacity.keys.some(k=>k.t===sec*3));
 assert.throws(()=>pasteClipOnTargets(d,'photo',[{kind:'transform',prop:'position'}],0,oc),/value type/);assert.throws(()=>pasteClipOnTargets(d,'photo',[],0,oc),/Select keys/);
 // stagger
 d=applyEdits(d,[{type:'prop.animate',layer:'stencil',prop:'opacity',on:true,t:0},{type:'prop.set',layer:'stencil',prop:'opacity',value:10,t:sec}]);
 const r3=d.revision;const ids=['photo','stencil'];const first=comp(d).layers.filter(l=>ids.includes(l.id));
 const sd=applyEdits(d,staggerLayers(d,ids,3));assert.equal(sd.revision,r3+1);
 const shift=frameToTick(3,comp(d).fps);assert.deepEqual(layer(sd,first[0].id).transform.opacity.keys.map(k=>k.t),layer(d,first[0].id).transform.opacity.keys.map(k=>k.t));
 assert.deepEqual(layer(sd,first[1].id).transform.opacity.keys.map(k=>k.t),layer(d,first[1].id).transform.opacity.keys.map(k=>k.t+shift));
 assert.throws(()=>staggerLayers(d,['photo'],3),/at least two/);assert.throws(()=>staggerLayers(d,ids,1.5),/whole number/);
 assert.deepEqual(validateDocument(sd),[]);
});

test('P21: bounce bakes editable keys that land on the target value; stagger also moves path keys and in/out points',()=>{
 let d=keyed();d=applyEdits(d,[{type:'prop.animate',layer:'photo',prop:'opacity',on:true,t:0},{type:'prop.set',layer:'photo',prop:'opacity',value:0,t:0},{type:'prop.set',layer:'photo',prop:'opacity',value:100,t:sec*2}]);
 const sel=allTargetKeys(layer(d,'photo')).filter(r=>r.target.kind==='transform'&&r.target.prop==='opacity');assert.equal(sel.length,2);
 const rev=d.revision;const b=applyEdits(d,bounceTargetKeys(d,'photo',sel,3));assert.equal(b.revision,rev+1);
 const ks=layer(b,'photo').transform.opacity.keys;assert.equal(ks.length,2+6,'3 bounces add 6 keys');
 assert.ok(ks.every((k,i)=>i===0||k.t>ks[i-1].t));assert.equal(ks[ks.length-1].v,100);assert.equal(ks[ks.length-1].t,sec*2);
 assert.equal(ks[1].v,100,'first landing is on the target value');assert.ok((ks[2].v as number)<100&&(ks[2].v as number)>0,'rebounds to a fraction');assert.ok((ks[4].v as number)>(ks[2].v as number),'later rebounds are smaller');
 assert.deepEqual(validateDocument(b),[]);
 const again=applyEdits(b,bounceTargetKeys(b,'photo',[{target:sel[0].target,t:0},{target:sel[0].target,t:ks[1].t}],1));assert.deepEqual(validateDocument(again),[]);
 assert.throws(()=>bounceTargetKeys(d,'photo',[sel[0]],3),/two neighbouring/);
 assert.throws(()=>bounceClip(layer(d,'photo').transform.opacity,0,sec*2,comp(d).fps,9),/Bounces must be/);
 const tiny=applyEdits(d,[{type:'prop.set',layer:'photo',prop:'opacity',value:100,t:frameToTick(3,comp(d).fps)}]);
 assert.throws(()=>bounceClip(layer(tiny,'photo').transform.opacity,0,frameToTick(3,comp(d).fps),comp(d).fps,3),/too short/);
 // vec2 bounce
 const vd=applyEdits(d,[{type:'prop.animate',layer:'photo',prop:'position',on:true,t:0},{type:'prop.set',layer:'photo',prop:'position',value:[0,0],t:0},{type:'prop.set',layer:'photo',prop:'position',value:[100,200],t:sec*2}]);
 const vs=allTargetKeys(layer(vd,'photo')).filter(r=>r.target.kind==='transform'&&r.target.prop==='position');
 const vb=applyEdits(vd,bounceTargetKeys(vd,'photo',vs,2));const vk=layer(vb,'photo').transform.position.keys;assert.deepEqual(vk[1].v,[100,200]);assert.equal(vk.length,2+4);
 // mask property bounce
 const mk=allTargetKeys(layer(d,'photo')).filter(r=>r.target.kind==='mask');
 let md=d;md=applyEdit(md,maskEdit(md,'photo',{op:'animate',mask:'m',prop:'opacity',on:true,t:0}));md=applyEdit(md,maskEdit(md,'photo',{op:'set',mask:'m',prop:'opacity',value:40,t:sec*2}));
 const ms=allTargetKeys(layer(md,'photo')).filter(r=>r.target.kind==='mask'&&r.target.prop==='opacity');assert.ok(mk.length>0&&ms.length===2);
 const mb=applyEdits(md,bounceTargetKeys(md,'photo',ms,2));assert.equal(layer(mb,'photo').masks![0].anim!.opacity!.keys.length,2+4);assert.deepEqual(validateDocument(mb),[]);
 // stagger: path keys and in/out points
 let sd=applyEdit(d,maskEdit(d,'stencil',{op:'add',id:'pm'}));sd=applyEdit(sd,maskEdit(sd,'stencil',{op:'update',mask:'pm',patch:{shape:'path'}}));
 sd=applyEdit(sd,maskEdit(sd,'stencil',{op:'pathAnimate',mask:'pm',on:true,t:0}));sd=applyEdit(sd,maskEdit(sd,'stencil',{op:'point',mask:'pm',index:0,x:9,y:9,t:sec}));
 const order=comp(sd).layers.filter(l=>['photo','stencil'].includes(l.id));const second=order[1];const sh=frameToTick(4,comp(sd).fps);
 const r4=sd.revision;const st=applyEdits(sd,staggerLayers(sd,['photo','stencil'],4));assert.equal(st.revision,r4+1);
 const L2=layer(st,second.id),L2o=layer(sd,second.id);assert.equal(L2.inT,Math.max(0,L2o.inT+sh));assert.ok(L2.outT<=comp(st).duration);
 if(second.id==='stencil')assert.deepEqual(L2.masks!.find(m=>m.id==='pm')!.shapeKeys!.map(k=>k.t),L2o.masks!.find(m=>m.id==='pm')!.shapeKeys!.map(k=>k.t+sh));
 const noTiming=applyEdits(sd,staggerLayers(sd,['photo','stencil'],4,false));assert.equal(layer(noTiming,second.id).inT,L2o.inT);
 assert.deepEqual(validateDocument(st),[]);
});

test('P21: animation commands carry a global shortcut for ease-all and a bounce command',()=>{
 const specs=animationCommandSpecs();const ease=specs.find(c=>c.id==='animation.keys.easeAll');assert.equal(ease?.shortcut,'Mod+Alt+E');
 assert.ok(specs.some(c=>c.id==='animation.keys.bounce')&&specs.some(c=>c.id==='animation.layers.stagger'));
 const shortcuts=specs.map(c=>c.shortcut).filter(Boolean);assert.equal(new Set(shortcuts).size,shortcuts.length);
});

test('P22: word units, selector stagger sweeps and bounds',()=>{
 let d=base();d=applyEdit(d,{type:'text.animators',layer:'title',animators:[{...defaultAnimator('a'),start:0,end:30,softness:0,position:[0,0],scale:100,opacity:0}]});
 const text='ab cd ef';const t0=comp(d).start;
 const chars=layer(d,'title');
 const wordOpacity=(unit:'char'|'word')=>{const dd=applyEdit(d,animatorEdit(d,'title',{op:'update',animator:'a',patch:{unit}}));return animatedChars(layer(dd,'title'),text,t0)!.map(c=>c.opacity);};
 assert.deepEqual(wordOpacity('word'),[0,0,0,1,1,1,1,1],'first word (and the space after it) is inside 0..30 %');
 assert.notDeepEqual(wordOpacity('char'),wordOpacity('word'));
 const bad=applyEdit(d,animatorEdit(d,'title',{op:'update',animator:'a',patch:{}}));assert.ok(bad);
 assert.throws(()=>applyEdit(d,{type:'text.animators',layer:'title',animators:[{...defaultAnimator('a'),unit:'line' as never}]}),EditError);
 // wave: selector starts clear of the text and ends past it, as one edit
 const rev=d.revision;const w=applyEdit(d,animatorEdit(d,'title',{op:'stagger',animator:'a',t:0,seconds:1,mode:'wave'}));assert.equal(w.revision,rev+1);
 const a=layer(w,'title').animators![0];assert.equal(a.offset.keys.length,2);
 const first=animatedChars(layer(w,'title'),text,0)!.map(c=>c.opacity),mid=animatedChars(layer(w,'title'),text,TICK_SEC/2)!.map(c=>c.opacity),end=animatedChars(layer(w,'title'),text,TICK_SEC)!.map(c=>c.opacity);
 assert.ok(first.every(o=>o===1),'before the wave nothing is affected');assert.ok(mid.some(o=>o===0)&&mid.some(o=>o===1),'during the wave some characters are hit');assert.ok(end.every(o=>o===1),'after the wave nothing is affected');
 // reveal: starts with the range covering the text, characters leave it from the left
 let r=applyEdit(d,animatorEdit(d,'title',{op:'update',animator:'a',patch:{start:0,end:100,softness:0,unit:'char'}}));
 r=applyEdit(r,animatorEdit(r,'title',{op:'stagger',animator:'a',t:0,seconds:1,mode:'reveal'}));
 const r0=animatedChars(layer(r,'title'),text,0)!.map(c=>c.opacity),rm=animatedChars(layer(r,'title'),text,TICK_SEC/2)!.map(c=>c.opacity),r1=animatedChars(layer(r,'title'),text,TICK_SEC)!.map(c=>c.opacity);
 assert.ok(r0.every(o=>o===0));assert.ok(rm[0]===1&&rm[rm.length-1]===0,'left characters appear first');assert.ok(r1.every(o=>o===1));
 assert.throws(()=>animatorEdit(d,'title',{op:'stagger',animator:'a',t:0,seconds:0,mode:'wave'}),/0.1 to 30/);
 assert.throws(()=>animatorEdit(d,'title',{op:'stagger',animator:'a',t:comp(d).duration,seconds:1,mode:'wave'}),/fit the composition/);
 assert.deepEqual(validateDocument(w),[]);void chars;
});

test('P22: motion presets apply to any layer in one step, save from keys, persist bounded',()=>{
 assert.equal(BUILTIN_MOTIONS.length,5);assert.ok(BUILTIN_MOTIONS.every(m=>validMotion(m)));
 let d=base();const rev=d.revision;
 for(const m of BUILTIN_MOTIONS){const e=motionEdits(d,'photo',m,0);const n=applyEdits(d,e);assert.equal(n.revision,rev+1,m.id);assert.deepEqual(validateDocument(n),[]);
  assert.ok(m.tracks.every(tr=>layer(n,'photo').transform[tr.prop].keys.length===tr.keys.length));}
 // relative tracks start from the layer value, absolute ones replace it
 const fl=applyEdits(d,motionEdits(d,'photo',BUILTIN_MOTIONS.find(m=>m.id==='builtin-float')!,0));const pos=layer(d,'photo').transform.position.value as unknown as number[];
 assert.deepEqual(layer(fl,'photo').transform.position.keys.map(k=>k.v),[[pos[0],pos[1]],[pos[0],pos[1]-12],[pos[0],pos[1]]]);
 const pop=applyEdits(d,motionEdits(d,'photo',BUILTIN_MOTIONS[0],0));assert.deepEqual(layer(pop,'photo').transform.scale.keys[0].v,[0,0]);
 // never overwrites, refuses locked layers and out-of-range
 assert.throws(()=>motionEdits(pop,'photo',BUILTIN_MOTIONS[0],0),/already has keys/);
 assert.throws(()=>motionEdits(d,'photo',BUILTIN_MOTIONS[0],comp(d).start+comp(d).duration),/does not fit/);
 // save from selected keys, apply on another layer
 const sel=allTargetKeys(layer(fl,'photo')).filter(r=>r.target.kind==='transform').map(r=>({layer:'photo',prop:(r.target as unknown as {prop:never}).prop,t:r.t}));
 const mine=motionFromKeys(layer(fl,'photo'),sel,'  Bob  ');assert.equal(mine.name,'Bob');assert.deepEqual(mine.tracks[0].keys.map(k=>k.dt),[0,sec,sec*2].slice(0,mine.tracks[0].keys.length).map((_,i)=>layer(fl,'photo').transform.position.keys[i].t-layer(fl,'photo').transform.position.keys[0].t));
 assert.deepEqual(mine.tracks[0].keys[1].v,[0,-12],'stored as an offset');
 const withBob=applyEdit(d,saveMotionEdit(d,mine));assert.ok(listMotions(withBob).some(m=>m.name==='Bob'));assert.equal(listMotions(d).length,5);assert.throws(()=>saveMotionEdit(withBob,{...mine,id:'x'}),/already exists/);
 const onOther=applyEdits(d,motionEdits(d,'stencil',findMotion(withBob,mine.id)!,0));const sp=layer(d,'stencil').transform.position.value as unknown as number[];assert.deepEqual(layer(onOther,'stencil').transform.position.keys[1].v,[sp[0],sp[1]-12]);
 assert.throws(()=>motionFromKeys(layer(fl,'photo'),sel,'   '),/1 to 40/);assert.throws(()=>motionFromKeys(layer(fl,'photo'),[],'x'),/Select keys/);
 assert.equal(validMotion({...mine,tracks:[{...mine.tracks[0],keys:[{...mine.tracks[0].keys[0],v:5}]}]}),false,'vec2 values must stay pairs');
 assert.equal(validMotion({...mine,tracks:[{...mine.tracks[0],keys:[{...mine.tracks[0].keys[0],out:[2,0]}]}]}),false);
 const without=applyEdit(withBob,deleteMotionEdit(withBob,mine.id));assert.ok(!listMotions(without).some(m=>m.name==='Bob'));assert.throws(()=>deleteMotionEdit(without,mine.id),/no longer exists/);
 let full=d;for(let i=0;i<MAX_USER_MOTIONS;i++)full=applyEdit(full,saveMotionEdit(full,{...mine,id:`m${i}`,name:`n${i}`}));assert.throws(()=>saveMotionEdit(full,{...mine,id:'z',name:'zz'}),/At most/);
assert.throws(()=>saveMotionEdit(full,{...mine,id:'z',name:'zz'}),/At most/);
});

test('P23: presets live in the document, survive snapshots, undo as one step, and exchange as bounded JSON',()=>{
 let d=base();const fl=applyEdits(d,motionEdits(d,'photo',BUILTIN_MOTIONS.find(m=>m.id==='builtin-float')!,0));
 const sel=allTargetKeys(layer(fl,'photo')).filter(r=>r.target.kind==='transform').map(r=>({layer:'photo',prop:(r.target as unknown as {prop:never}).prop,t:r.t}));
 const mine=motionFromKeys(layer(fl,'photo'),sel,'Bob');
 assert.equal(d.motions,undefined,'documents without presets stay unchanged');
 const rev=d.revision;d=applyEdit(d,saveMotionEdit(d,mine));assert.equal(d.revision,rev+1);assert.equal(d.motions!.version,1);assert.deepEqual(validateDocument(d),[]);
 // snapshot round trip keeps presets; a damaged library is rejected
 const back=parseAnimationSnapshot(serializeAnimationSnapshot(d,defaultView())).doc;assert.deepEqual(userMotions(back),userMotions(d));
 assert.ok(validateDocument({...d,motions:{version:2,items:[]}}).length);assert.ok(validateDocument({...d,motions:{version:1,items:[mine,mine]}}).length,'duplicate ids');
 assert.ok(validateDocument({...d,motions:{version:1,items:Array.from({length:MAX_USER_MOTIONS+1},(_,i)=>({...mine,id:`i${i}`,name:`n${i}`}))}}).length);
 assert.throws(()=>applyEdit(d,{type:'motions.set',items:[{...mine,tracks:[]}]}),EditError);
 // export then import into a fresh document: fresh ids, unique names, one undo step
 const text=exportMotionsJson(userMotions(d));assert.ok(!text.includes('builtin'));assert.equal(JSON.parse(text).format,'somnia-motions');
 const parsed=parseMotionsJson(text);assert.equal(parsed.length,1);
 const other=base();const imp=applyEdit(other,mergeMotionsEdit(other,parsed));assert.equal(imp.revision,other.revision+1);assert.equal(userMotions(imp)[0].name,'Bob');assert.notEqual(userMotions(imp)[0].id,mine.id);
 const twice=applyEdit(imp,mergeMotionsEdit(imp,parsed));assert.deepEqual(userMotions(twice).map(m=>m.name),['Bob','Bob 2']);
 const clash=parseMotionsJson(exportMotionsJson([{...mine,name:'Pop in'.slice(0,0)||'pulse'}]));assert.equal(userMotions(applyEdit(other,mergeMotionsEdit(other,clash)))[0].name,'pulse 2','built-in names are taken too');
 // bad files never reach the document
 assert.throws(()=>parseMotionsJson('nope'),/not a preset file/);assert.throws(()=>parseMotionsJson('{"format":"other"}'),/not a preset file/);
 assert.throws(()=>parseMotionsJson(JSON.stringify({format:'somnia-motions',version:9,presets:[]})),/version/);
 assert.throws(()=>parseMotionsJson(JSON.stringify({format:'somnia-motions',version:1,presets:[{name:'x',tracks:[{prop:'evil',rel:false,keys:[]}]}]})),/not valid/);
 assert.throws(()=>parseMotionsJson('x'.repeat(300_001)),/too large/);
 assert.throws(()=>mergeMotionsEdit(applyEdit(other,mergeMotionsEdit(other,Array.from({length:MAX_USER_MOTIONS},(_,i)=>({...mine,name:`q${i}`})))),parsed),/At most/);
 // one-time migration source: valid entries only, never mutated
 const store=new Map<string,string>();(globalThis as unknown as {localStorage:unknown}).localStorage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>void store.set(k,v),removeItem:(k:string)=>void store.delete(k)};
 try{store.set(LEGACY_KEY,JSON.stringify([mine,{id:'bad',name:'',tracks:[]}]));const old=legacyMotions();assert.equal(old.length,1);assert.equal(old[0].name,'Bob');assert.ok(store.has(LEGACY_KEY));
  assert.equal(userMotions(applyEdit(other,mergeMotionsEdit(other,old))).length,1);store.set(LEGACY_KEY,'{broken');assert.deepEqual(legacyMotions(),[]);}
 finally{delete (globalThis as unknown as {localStorage?:unknown}).localStorage;}
});

test('P24: elastic bakes overshooting keys, custom cubic eases and named easings live in the document',()=>{
 let d=keyed();d=applyEdits(d,[{type:'prop.animate',layer:'photo',prop:'opacity',on:true,t:0},{type:'prop.set',layer:'photo',prop:'opacity',value:0,t:0},{type:'prop.set',layer:'photo',prop:'opacity',value:100,t:sec*2}]);
 const sel=allTargetKeys(layer(d,'photo')).filter(r=>r.target.kind==='transform'&&r.target.prop==='opacity');
 const rev=d.revision;const el=applyEdits(d,elasticTargetKeys(d,'photo',sel,3));assert.equal(el.revision,rev+1,'one undo step');
 const ks=layer(el,'photo').transform.opacity.keys;assert.equal(ks.length,2+3,'3 swings add 3 keys');
 assert.ok(ks.every((k,i)=>i===0||k.t>ks[i-1].t));assert.equal(ks[ks.length-1].v,100);assert.equal(ks[ks.length-1].t,sec*2);
 assert.deepEqual(ks.slice(0,4).map(k=>k.v),[0,100,84,100],'opacity overshoot is clamped to its 0-100 range');
 const rot=applyEdits(keyed(),[{type:'prop.animate',layer:'photo',prop:'rotation',on:true,t:0},{type:'prop.set',layer:'photo',prop:'rotation',value:0,t:0},{type:'prop.set',layer:'photo',prop:'rotation',value:100,t:sec*2}]);
 const rs=allTargetKeys(layer(rot,'photo')).filter(r=>r.target.kind==='transform'&&r.target.prop==='rotation');
 assert.deepEqual(layer(applyEdits(rot,elasticTargetKeys(rot,'photo',rs,3)),'photo').transform.rotation.keys.slice(0,4).map(k=>k.v),[0,140,84,106.4],'overshoot, undershoot, smaller overshoot');assert.deepEqual(validateDocument(el),[]);
 assert.throws(()=>elasticTargetKeys(d,'photo',sel,0),/Swings/);assert.throws(()=>elasticTargetKeys(d,'photo',sel,9),/Swings/);
 assert.throws(()=>elasticTargetKeys(d,'photo',[sel[0]],2),/neighbouring/);
 // custom cubic through keys.interp: x limited to 0..1, y free within the easing range
 const cu=applyEdit(d,{type:'keys.interp',keys:sel.slice(0,1).map(r=>({layer:'photo',prop:'opacity' as const,t:r.t})),interp:'bezier',out:[0.2,1.4],in:[0.8,1]});assert.deepEqual(layer(cu,'photo').transform.opacity.keys[0].out,[0.2,1.4]);
 assert.throws(()=>applyEdit(d,{type:'keys.interp',keys:[{layer:'photo',prop:'opacity',t:0}],interp:'bezier',out:[1.5,0],in:[0.8,1]}),EditError);
 // named easings: bounded, unique, validated, in snapshots, one step each
 const e1=applyEdit(d,saveEasingEdit(d,'  Snap  ',[0.9,0],[0.1,1]));assert.equal(e1.revision,d.revision+1);assert.equal(userEasings(e1)[0].name,'Snap');assert.equal(e1.easings!.version,1);
 assert.deepEqual(parseAnimationSnapshot(serializeAnimationSnapshot(e1,defaultView())).doc.easings,e1.easings);
 assert.throws(()=>saveEasingEdit(e1,'Snap',[0.5,0],[0.5,1]),/already exists/);assert.throws(()=>saveEasingEdit(d,'ease',[0.5,0],[0.5,1]),/already exists/,'built-in names are taken');
 assert.throws(()=>saveEasingEdit(d,'x',[1.5,0],[0.5,1]),/Handles/);assert.throws(()=>saveEasingEdit(d,'x',[0.5,5],[0.5,1]),/Handles/);assert.throws(()=>saveEasingEdit(d,'  ',[0.5,0],[0.5,1]),/Name/);
 assert.ok(validateEasingLib({version:2,items:[]}).length);assert.ok(validateEasingLib({version:1,items:[{id:'a',name:'A',out:[2,0],in:[0,0]}]}).length);
 assert.ok(validateDocument({...e1,easings:{version:1,items:[...userEasings(e1),...userEasings(e1)]}}).length,'duplicates');
 assert.throws(()=>applyEdit(d,{type:'easings.set',items:[{id:'a',name:'',out:[0,0],in:[1,1]}]}),EditError);
 const gone=applyEdit(e1,deleteEasingEdit(e1,findEasing(e1,userEasings(e1)[0].id)!.id));assert.equal(userEasings(gone).length,0);assert.throws(()=>deleteEasingEdit(gone,'nope'),/no longer exists/);
 let full=d;for(let i=0;i<MAX_EASINGS;i++)full=applyEdit(full,saveEasingEdit(full,`e${i}`,[0.5,0],[0.5,1]));assert.throws(()=>saveEasingEdit(full,'more',[0.5,0],[0.5,1]),/At most/);
});

test('P25: path-to-path morph keys a mask to another path with the same point count, refuses otherwise',()=>{
 let d=base();const tri=[{x:0,y:0},{x:100,y:0},{x:50,y:90}];
 d=applyEdit(d,maskEdit(d,'photo',{op:'add',id:'a'}));d=applyEdit(d,maskEdit(d,'photo',{op:'add',id:'b'}));d=applyEdit(d,maskEdit(d,'photo',{op:'add',id:'c'}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'path',mask:'a',points:tri,closed:true,smooth:false}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'path',mask:'b',points:[{x:10,y:10},{x:200,y:20},{x:80,y:150}],closed:true,smooth:false}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'path',mask:'c',points:[{x:0,y:0},{x:50,y:0},{x:50,y:50},{x:0,y:50}],closed:true,smooth:false}));
 const masks=()=>layer(d,'photo').masks!;const at=Math.round(sec*2);
 assert.equal(morphProblem(masks()[0],masks()[1]),null);assert.match(morphProblem(masks()[0],masks()[2])!.en,/different numbers of points \(3 and 4\)/);assert.match(morphProblem(masks()[0],masks()[0])!.en,/another mask/);
 const rev=d.revision;const m=applyEdit(d,maskEdit(d,'photo',{op:'morphTo',mask:'a',other:'b',t:at}));assert.equal(m.revision,rev+1,'one undo step');
 const a=layer(m,'photo').masks![0];assert.equal(a.shapeKeys!.length,2);assert.equal(a.shapeKeys![0].t,comp(m).start);assert.deepEqual(a.shapeKeys![0].path.points,tri,'start key holds the old shape');
 const bm=layer(m,'photo').masks![1];assert.deepEqual(a.shapeKeys![1].path.points.map(p=>[p.x,p.y]),bm.path!.points.map(p=>[p.x+bm.x-a.x,p.y+bm.y-a.y]),'placed in the target mask space');
 assert.deepEqual(validateDocument(m),[]);
 const mid=resolveMask(a,Math.round(at/2)).path!.points[1];assert.ok(mid.x>100&&mid.x<200,'interpolates between the two shapes');
 // second morph on an animated path adds a key; same time replaces it
 const m2=applyEdit(m,maskEdit(m,'photo',{op:'morphTo',mask:'a',other:'b',t:Math.round(sec*4)}));assert.equal(layer(m2,'photo').masks![0].shapeKeys!.length,3);
 const m3=applyEdit(m2,maskEdit(m2,'photo',{op:'morphTo',mask:'a',other:'b',t:Math.round(sec*4)}));assert.equal(layer(m3,'photo').masks![0].shapeKeys!.length,3);
 // refusals change nothing
 assert.throws(()=>maskEdit(d,'photo',{op:'morphTo',mask:'a',other:'c',t:at}),/different numbers of points/);
 assert.throws(()=>maskEdit(d,'photo',{op:'morphTo',mask:'a',other:'b',t:comp(d).start}),/past the first frame/);
 assert.throws(()=>maskEdit(d,'photo',{op:'morphTo',mask:'a',other:'zzz',t:at}),/no longer exists/);
 assert.throws(()=>maskEdit(d,'photo',{op:'morphTo',mask:'a',other:'a',t:at}),/another mask/);
 const closedB=applyEdit(d,maskEdit(d,'photo',{op:'path',mask:'b',points:[{x:10,y:10},{x:200,y:20},{x:80,y:150}],closed:false,smooth:false}));
 assert.throws(()=>maskEdit(closedB,'photo',{op:'morphTo',mask:'a',other:'b',t:at}),/closed/);
 assert.throws(()=>morphPath(masks()[0],{...masks()[1],shape:'rect',path:undefined},at,comp(d)),/path masks/);
});

test('P26: morph can resample by arc length, reverse and rotate the start point; refusals carry locale keys',()=>{
 let d=base();const sq=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];const tri=[{x:0,y:0},{x:90,y:0},{x:45,y:80}];
 d=applyEdit(d,maskEdit(d,'photo',{op:'add',id:'a'}));d=applyEdit(d,maskEdit(d,'photo',{op:'add',id:'b'}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'path',mask:'a',points:tri,closed:true,smooth:false}));d=applyEdit(d,maskEdit(d,'photo',{op:'path',mask:'b',points:sq,closed:true,smooth:false}));
 const ms=()=>layer(d,'photo').masks!;const at=Math.round(sec*2);const key=(x:AnimationDocument,i=0)=>layer(x,'photo').masks![i].shapeKeys!.at(-1)!.path.points;
 // without matching the old refusal stays, with a locale key and the numbers
 const p=morphProblem(ms()[0],ms()[1])!;assert.equal(p.key,'animation.morph.err.count');assert.deepEqual(p.params,{a:3,b:4});
 try{maskEdit(d,'photo',{op:'morphTo',mask:'a',other:'b',t:at});assert.fail('should refuse');}catch(e){assert.ok(e instanceof MorphError);assert.equal((e as MorphError).problem.key,'animation.morph.err.count');}
 // resample 4 -> 3 points: even spacing along a square (perimeter 400, 3 points = 133.33 apart)
 const rev=d.revision;const m=applyEdit(d,maskEdit(d,'photo',{op:'morphTo',mask:'a',other:'b',t:at,match:'resample'}));assert.equal(m.revision,rev+1,'one undo step');
 const k=key(m);assert.equal(k.length,3);const bm=ms()[1],am=ms()[0];assert.deepEqual([k[0].x,k[0].y],[bm.x-am.x,bm.y-am.y],'starts at the source start point');
 const dist=(i:number,j:number)=>Math.hypot(k[i].x-k[j].x,k[i].y-k[j].y);assert.ok(dist(0,1)>100&&dist(0,1)<140);assert.deepEqual(validateDocument(m),[]);
 // direct path math: open path keeps its endpoints, count is exact, bounded by the target count
 const line=resamplePath({closed:false,points:[{x:0,y:0},{x:100,y:0}]},5);assert.deepEqual(line.points.map(q=>q.x),[0,25,50,75,100]);
 assert.equal(resamplePath({closed:true,points:sq},32).points.length,32);assert.throws(()=>resamplePath({closed:true,points:[{x:5,y:5},{x:5,y:5},{x:5,y:5}]},4),MorphError);
 // reverse flips the order, shift rotates the start
 let e=applyEdit(d,maskEdit(d,'photo',{op:'path',mask:'b',points:[{x:0,y:0},{x:90,y:0},{x:45,y:80}],closed:true,smooth:false}));
 const plain=key(applyEdit(e,maskEdit(e,'photo',{op:'morphTo',mask:'a',other:'b',t:at})));
 const r=key(applyEdit(e,maskEdit(e,'photo',{op:'morphTo',mask:'a',other:'b',t:at,reverse:true})));assert.deepEqual(r.map(q=>[q.x,q.y]),[...plain].reverse().map(q=>[q.x,q.y]));
 const sh=key(applyEdit(e,maskEdit(e,'photo',{op:'morphTo',mask:'a',other:'b',t:at,shift:1})));assert.deepEqual(sh.map(q=>[q.x,q.y]),[plain[1],plain[2],plain[0]].map(q=>[q.x,q.y]));
 assert.throws(()=>maskEdit(e,'photo',{op:'morphTo',mask:'a',other:'b',t:at,shift:3}),MorphError);
 const open=applyEdit(e,maskEdit(e,'photo',{op:'path',mask:'a',points:tri,closed:false,smooth:false}));const open2=applyEdit(open,maskEdit(open,'photo',{op:'path',mask:'b',points:tri,closed:false,smooth:false}));
 assert.equal(morphProblem(layer(open2,'photo').masks![0],layer(open2,'photo').masks![1],{shift:1})!.key,'animation.morph.err.shiftOpen');
 // smooth sources stay smooth after resampling
 const sm=resamplePath(smoothPath(sq,true,true),6);assert.ok(sm.points.every(q=>q.inX!==undefined&&q.outX!==undefined));
 // every refusal key exists in all five locales
 const keys=['same','notPath','count','closed','shiftRange','shiftOpen','flat','first','limit'].map(x=>`animation.morph.err.${x}`).concat(['animation.morph.match','animation.morph.reverse','animation.morph.start']);
 for(const l of ['en','de','es','fr','pt-BR']){const j=JSON.parse(readFileSync(new URL(`../../locales/animation/${l}.json`,import.meta.url),'utf8')) as Record<string,string>;for(const k2 of keys)assert.ok(j[k2],`${l} ${k2}`);}
});

import {layerPathD,pathLayerEdit,maskToLayerEdit} from './pathLayer';
import {pathData} from '../interface/vectorCore';
const pathDoc=()=>{let d=base();const sq=(p:{x:number;y:number}[])=>({shape:'path' as const,color:'#ff0000',width:200,height:100,path:{closed:true,points:p}});
 d=applyEdit(d,{type:'layer.add',kind:'shape',id:'pa',over:{source:sq([{x:0,y:0},{x:1,y:0},{x:0.5,y:1}])}});
 d=applyEdit(d,{type:'layer.add',kind:'shape',id:'pb',over:{source:sq([{x:0.1,y:0.1},{x:0.9,y:0.2},{x:0.5,y:0.8}])}});return d;};
test('P27: plain path layers render exactly as before, handles switch to bezier',()=>{
 let d=pathDoc();const l=layer(d,'pa');assert.equal(layerPathD(l,0),pathData(l.source.path as never,200,100));
 d=applyEdit(d,{type:'layer.update',layer:'pa',source:{path:{closed:true,points:[{x:0,y:0,outX:0.1,outY:0},{x:1,y:0},{x:0.5,y:1}]}}});assert.match(layerPathD(layer(d,'pa'),0),/C/);
 assert.throws(()=>applyEdit(d,{type:'layer.update',layer:'pa',source:{path:{closed:true,points:[{x:0,y:0,outX:5},{x:1,y:0}]}}}),EditError);
 assert.throws(()=>applyEdit(d,{type:'layer.update',layer:'pa',source:{pathKeys:[{t:0,path:{closed:false,points:[{x:0,y:0},{x:1,y:0},{x:1,y:1}]}}]}}),EditError,'closed flag must match');
 assert.throws(()=>applyEdit(d,{type:'layer.update',layer:'photo',source:{pathKeys:[{t:0,path:{closed:true,points:[{x:0,y:0},{x:1,y:1}]}}]}}),EditError,'only for path shapes');
});
test('P27: path layers morph into other path layers with one undo, refusals carry locale keys',()=>{
 let d=pathDoc();const at=Math.round(sec*2),rev=d.revision;
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'animate',on:true}));assert.equal(layer(d,'pa').source.pathKeys!.length,1);
 const r2=d.revision;d=applyEdit(d,pathLayerEdit(d,'pa',{op:'morphTo',other:'pb',t:at}));assert.equal(d.revision,r2+1,'one undo step');
 const k=layer(d,'pa').source.pathKeys!;assert.equal(k.length,2);assert.deepEqual(k[1].path.points.map(p=>[p.x,p.y]),[[0.1,0.1],[0.9,0.2],[0.5,0.8]]);
 const mid=layerPathD(layer(d,'pa'),Math.round((comp(d).start+at)/2));assert.notEqual(mid,layerPathD(layer(d,'pa'),0));assert.ok(validateDocument(d));
 const bad=(e:()=>unknown,key:string)=>assert.throws(e,(x:unknown)=>x instanceof MorphError&&x.problem.key===key);
 bad(()=>pathLayerEdit(d,'pa',{op:'morphTo',other:'pa',t:at}),'animation.morph.err.sameLayer');
 bad(()=>pathLayerEdit(d,'pa',{op:'morphTo',other:'photo',t:at}),'animation.morph.err.notPathLayer');
 let q=pathDoc();q=applyEdit(q,{type:'layer.update',layer:'pb',source:{path:{closed:true,points:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]}}});
 bad(()=>pathLayerEdit(q,'pa',{op:'morphTo',other:'pb',t:at}),'animation.morph.err.count');
 const ok=applyEdit(q,pathLayerEdit(q,'pa',{op:'morphTo',other:'pb',t:at,opts:{match:'resample',reverse:true}}));assert.equal(layer(ok,'pa').source.pathKeys![1].path.points.length,3);
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'point',index:0,x:0.3,y:0.3,t:at}));assert.equal(layer(d,'pa').source.pathKeys![1].path.points[0].x,0.3);
 assert.throws(()=>pathLayerEdit(d,'pa',{op:'points',path:{closed:true,points:[{x:0,y:0},{x:1,y:1}]}}),/Turn off/);
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'animate',on:false,t:at}));assert.equal(layer(d,'pa').source.pathKeys,undefined);assert.equal(layer(d,'pa').source.path!.points[0].x,0.3);
 assert.ok(rev<d.revision);
});
test('P27: a path mask becomes a shape layer in one undo step at the same place',()=>{
 let d=base();d=applyEdit(d,maskEdit(d,'photo',{op:'add',id:'a'}));
 d=applyEdit(d,maskEdit(d,'photo',{op:'path',mask:'a',points:[{x:20,y:10},{x:120,y:10},{x:70,y:90}],closed:true,smooth:false}));
 const rev=d.revision,n=comp(d).layers.length;d=applyEdit(d,maskToLayerEdit(d,'photo','a','fromMask'));assert.equal(d.revision,rev+1);assert.equal(comp(d).layers.length,n+1);
 const l=layer(d,'fromMask'),m=layer(d,'photo').masks![0];assert.equal(l.source.shape,'path');assert.equal(l.source.width,100);assert.equal(l.source.height,80);
 assert.deepEqual(l.source.path!.points.map(p=>[p.x,p.y]),[[0,0],[1,0],[0.5,1]]);
 const a0=layer(d,'photo').transform.anchor.value as unknown as number[],a1=l.transform.anchor.value as unknown as number[];assert.deepEqual([a0[0]-a1[0],a0[1]-a1[1]],[m.x+20,m.y+10]);
 assert.throws(()=>maskToLayerEdit(d,'photo','nope'),/no longer/);
});
test('P27: path layer locale keys exist in all five locales',()=>{
 for(const l of ['en','de','es','fr','pt-BR']){const j=JSON.parse(readFileSync(new URL(`../../locales/animation/${l}.json`,import.meta.url),'utf8'));
  for(const k of ['animation.morph.err.sameLayer','animation.morph.err.notPathLayer','animation.morph.err.outside','animation.pathLayer.animate','animation.pathLayer.target','animation.masks.toLayer','cmd.animation.layer.path','cmd.animation.mask.toLayer'])assert.ok(j[k],`${l} ${k}`);}
});

import {penNewLayerEdit,MAX_PEN_POINTS} from './pathLayer';
test('P28: pen strokes build a path layer, one undo step per click or drag',()=>{
 let d=base();const c=comp(d),rev=d.revision;
 d=applyEdit(d,penNewLayerEdit(d,c.width/2,c.height/2,'pen1'));assert.equal(d.revision,rev+1,'creating the layer is one step');
 const l=layer(d,'pen1');assert.equal(l.source.width,c.width);assert.deepEqual(l.source.path!.points,[{x:0.5,y:0.5}]);assert.deepEqual(l.transform.position.value,[0,0]);
 const steps=[[0.8,0.5,0.1,0],[0.8,0.9],[0.2,0.9,0,0.001]] as const;
 for(const [x,y,ox,oy] of steps){const r=d.revision;d=applyEdit(d,pathLayerEdit(d,'pen1',{op:'pen',x,y,outX:ox,outY:oy}));assert.equal(d.revision,r+1);}
 const pts=layer(d,'pen1').source.path!.points;assert.equal(pts.length,4);assert.equal(pts[1].outX,0.1);assert.equal(pts[1].inX,-0.1);assert.equal(pts[2].outX,undefined,'no drag, corner');assert.equal(pts[3].outX,undefined,'tiny drag is a click');
 assert.match(layerPathD(layer(d,'pen1'),0),/C/);
 d=applyEdit(d,pathLayerEdit(d,'pen1',{op:'pen',x:5,y:-3}));assert.deepEqual([layer(d,'pen1').source.path!.points[4].x,layer(d,'pen1').source.path!.points[4].y],[1,0],'clamped to the layer box');
 d=applyEdit(d,pathLayerEdit(d,'pen1',{op:'close'}));assert.equal(layer(d,'pen1').source.path!.closed,true);
 assert.throws(()=>pathLayerEdit(d,'pen1',{op:'pen',x:0.1,y:0.1}),/closed/);assert.ok(validateDocument(d));
});
test('P28: handle drags edit one point, mirror, animate keys, and stay bounded',()=>{
 let d=pathDoc();const r=d.revision;
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'handle',index:1,which:'out',x:0.2,y:0.1,mirror:true}));assert.equal(d.revision,r+1);
 let q=layer(d,'pa').source.path!.points[1];assert.deepEqual([q.outX,q.outY,q.inX,q.inY],[0.2,0.1,-0.2,-0.1]);
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'handle',index:1,which:'in',x:-0.05,y:0,mirror:false}));q=layer(d,'pa').source.path!.points[1];assert.deepEqual([q.outX,q.inX],[0.2,-0.05]);
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'handle',index:0,which:'out',x:9,y:-9,mirror:false}));assert.equal(layer(d,'pa').source.path!.points[0].outX,2,'handle bounded to +-2');
 assert.throws(()=>pathLayerEdit(d,'pa',{op:'handle',index:7,which:'out',x:0,y:0}),/no longer/);
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'animate',on:true}));const at=Math.round(sec*2);
 assert.throws(()=>pathLayerEdit(d,'pa',{op:'handle',index:0,which:'out',x:0,y:0}),/time is needed/);
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'handle',index:0,which:'out',x:0.3,y:0,t:at}));assert.equal(layer(d,'pa').source.pathKeys!.length,2);
 assert.throws(()=>pathLayerEdit(d,'pa',{op:'pen',x:0.5,y:0.5}),/animation/);assert.throws(()=>pathLayerEdit(d,'pa',{op:'close'}),/animation/);
 assert.equal(MAX_PEN_POINTS,256);
 let big=pathDoc();big=applyEdit(big,{type:'layer.update',layer:'pa',source:{path:{closed:false,points:Array.from({length:MAX_PEN_POINTS},(_,i)=>({x:i/MAX_PEN_POINTS,y:0.5}))}}});
 assert.throws(()=>pathLayerEdit(big,'pa',{op:'pen',x:0.5,y:0.5}),/At most 256/);
});
test('P28: pen command and locale keys exist',()=>{
 assert.ok(animationCommandSpecs().some(s=>s.id==='animation.layer.pen'));
 for(const l of ['en','de','es','fr','pt-BR']){const j=JSON.parse(readFileSync(new URL(`../../locales/animation/${l}.json`,import.meta.url),'utf8'));
  for(const k of ['animation.pathLayer.overlay','animation.pathLayer.tools','animation.pathLayer.pen','animation.pathLayer.penHint','animation.pathLayer.close','cmd.animation.layer.pen'])assert.ok(j[k],`${l} ${k}`);}
});

import {pathLayerMoveEdit,splitAt,cornerAt} from './pathLayer';
test('P29: insert splits a segment without changing the shape, remove and corner are bounded',()=>{
 let d=pathDoc();const r=d.revision;
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'insert',index:0,u:0.25}));assert.equal(d.revision,r+1);
 let pts=layer(d,'pa').source.path!.points;assert.equal(pts.length,4);assert.deepEqual([pts[1].x,pts[1].y],[0.25,0],'straight segment splits on the line');assert.equal(pts[1].outX,undefined,'corners stay corners');
 const curved=splitAt({closed:true,points:[{x:0,y:0,outX:0.3,outY:0},{x:1,y:0,inX:-0.3,inY:0},{x:0.5,y:1}]},0,0.5);assert.equal(curved.points.length,4);assert.ok(curved.points[1].inX!==undefined&&curved.points[1].outX!==undefined);
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'corner',index:2,smooth:true}));pts=layer(d,'pa').source.path!.points;assert.ok(pts[2].inX!==undefined&&pts[2].outX!==undefined);assert.match(layerPathD(layer(d,'pa'),0),/C/);
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'corner',index:2,smooth:false}));assert.equal(layer(d,'pa').source.path!.points[2].outX,undefined);
 assert.equal(cornerAt({closed:false,points:[{x:0,y:0},{x:1,y:1}]},0,true).points[0].inX,undefined,'open ends keep one handle');
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'remove',index:1}));assert.equal(layer(d,'pa').source.path!.points.length,3);
 assert.throws(()=>pathLayerEdit(d,'pa',{op:'remove',index:0}),/three points/,'closed path keeps three');
 assert.throws(()=>pathLayerEdit(d,'pa',{op:'insert',index:9}),/no longer/);
});
test('P29: insert and remove on an animated path keep every key in step; caps hold',()=>{
 let d=pathDoc();d=applyEdit(d,pathLayerEdit(d,'pa',{op:'animate',on:true}));d=applyEdit(d,pathLayerEdit(d,'pa',{op:'morphTo',other:'pb',t:Math.round(sec*2)}));
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'insert',index:1}));const s=layer(d,'pa').source;assert.equal(s.path!.points.length,4);assert.ok(s.pathKeys!.every(k=>k.path.points.length===4));
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'remove',index:2}));assert.ok(layer(d,'pa').source.pathKeys!.every(k=>k.path.points.length===3));assert.ok(validateDocument(d));
 let big=pathDoc();big=applyEdit(big,{type:'layer.update',layer:'pa',source:{path:{closed:true,points:Array.from({length:32},(_,i)=>({x:i/40,y:0.5}))}}});
 big=applyEdit(big,pathLayerEdit(big,'pa',{op:'animate',on:true}));assert.throws(()=>pathLayerEdit(big,'pa',{op:'insert',index:0}),/At most 32/);
});
test('P29: dragging the outline moves the layer by one position edit, through the parent matrix',()=>{
 let d=pathDoc();const r=d.revision,p0=layer(d,'pa').transform.position.value as unknown as number[];
 d=applyEdit(d,pathLayerMoveEdit(d,'pa',30,-10,0));assert.equal(d.revision,r+1);const p1=layer(d,'pa').transform.position.value as unknown as number[];assert.deepEqual([p1[0]-p0[0],p1[1]-p0[1]],[30,-10]);
 d=applyEdit(d,{type:'layer.update',layer:'pb',source:{}});
 d=applyEdit(d,{type:'layer.update',layer:'pa',locked:true});assert.throws(()=>pathLayerMoveEdit(d,'pa',1,1,0),/locked/);
 d=applyEdit(d,{type:'layer.update',layer:'pa',locked:false});
 d=applyEdit(d,{type:'layer.add',kind:'null',id:'half'});d=applyEdit(d,{type:'prop.set',layer:'half',prop:'scale',value:[50,50],t:0});d=applyEdit(d,{type:'layer.parent',layer:'pa',parent:'half'});
 const before=layer(d,'pa').transform.position.value as unknown as number[];d=applyEdit(d,pathLayerMoveEdit(d,'pa',10,10,0));const after=layer(d,'pa').transform.position.value as unknown as number[];
 assert.deepEqual([after[0]-before[0],after[1]-before[1]],[20,20],'half-scale parent: 10 comp px is 20 local px');
});
test('P29: point menu locale keys exist',()=>{
 for(const l of ['en','de','es','fr','pt-BR']){const j=JSON.parse(readFileSync(new URL(`../../locales/animation/${l}.json`,import.meta.url),'utf8'));for(const k of ['animation.pathLayer.smoothPoint','animation.pathLayer.cornerPoint','animation.pathLayer.deletePoint'])assert.ok(j[k],`${l} ${k}`);}
});

import {movePointsBy,reshapeSegment} from './pathLayer';
const squareDoc=()=>{let d=pathDoc();return applyEdit(d,{type:'layer.update',layer:'pa',source:{path:{closed:true,points:[{x:0.2,y:0.2},{x:0.8,y:0.2},{x:0.8,y:0.8},{x:0.2,y:0.8},{x:0.5,y:0.9}]}}});};
test('P30: group move shifts the selected points together, one edit, and keeps the shape inside the box',()=>{
 let d=squareDoc();const r=d.revision;
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'movePoints',indices:[0,1],dx:0.1,dy:0.05}));assert.equal(d.revision,r+1);
 let p=layer(d,'pa').source.path!.points;assert.deepEqual([p[0].x,p[0].y,p[1].x,p[1].y],[0.3,0.25,0.9,0.25]);assert.deepEqual([p[2].x,p[3].x],[0.8,0.2],'others stay');
 const lim=movePointsBy(layer(d,'pa').source.path!,[0,1],0.5,0);assert.equal(lim.points[1].x,1,'delta limited by the box edge');assert.ok(Math.abs(lim.points[1].x-lim.points[0].x-0.6)<1e-9,'distance between moved points kept');
 assert.throws(()=>pathLayerEdit(d,'pa',{op:'movePoints',indices:[9],dx:0,dy:0}),/no longer/);assert.throws(()=>pathLayerEdit(d,'pa',{op:'movePoints',indices:[],dx:0,dy:0}),/no longer/);
});
test('P30: group delete and smooth are bounded and keep animated keys in step',()=>{
 let d=squareDoc();const r=d.revision;
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'cornerPoints',indices:[1,2,3],smooth:true}));assert.equal(d.revision,r+1);assert.ok(layer(d,'pa').source.path!.points.slice(1,4).every(q=>q.outX!==undefined&&q.inX!==undefined));assert.equal(layer(d,'pa').source.path!.points[0].outX,undefined);
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'cornerPoints',indices:[1,2],smooth:false}));assert.equal(layer(d,'pa').source.path!.points[1].outX,undefined);
 d=applyEdit(d,pathLayerEdit(d,'pa',{op:'removePoints',indices:[3,4]}));assert.equal(layer(d,'pa').source.path!.points.length,3);
 assert.throws(()=>pathLayerEdit(d,'pa',{op:'removePoints',indices:[0]}),/three points/);
 let a=squareDoc();a=applyEdit(a,pathLayerEdit(a,'pa',{op:'animate',on:true}));a=applyEdit(a,pathLayerEdit(a,'pa',{op:'point',index:0,x:0.1,y:0.1,t:Math.round(sec*2)}));
 a=applyEdit(a,pathLayerEdit(a,'pa',{op:'removePoints',indices:[3,4]}));assert.ok(layer(a,'pa').source.pathKeys!.every(k=>k.path.points.length===3));assert.ok(validateDocument(a));
 a=applyEdit(a,pathLayerEdit(a,'pa',{op:'movePoints',indices:[0,1],dx:0.05,dy:0,t:Math.round(sec*3)}));assert.equal(layer(a,'pa').source.pathKeys!.length,3);
 assert.throws(()=>pathLayerEdit(a,'pa',{op:'movePoints',indices:[0],dx:0.1,dy:0}),/time is needed/);
});
test('P30: segment drag reshapes the curve so the grabbed point follows the pointer',()=>{
 const sq={closed:true,points:[{x:0.2,y:0.2},{x:0.8,y:0.2},{x:0.8,y:0.8},{x:0.2,y:0.8}]};
 const bez=(p:typeof sq,i:number,u:number)=>{const a=p.points[i] as {x:number;y:number;outX?:number;outY?:number},b=p.points[(i+1)%p.points.length] as {x:number;y:number;inX?:number;inY?:number},v=1-u;
  const x=v**3*a.x+3*v*v*u*(a.x+(a.outX??0))+3*v*u*u*(b.x+(b.inX??0))+u**3*b.x,y=v**3*a.y+3*v*v*u*(a.y+(a.outY??0))+3*v*u*u*(b.y+(b.inY??0))+u**3*b.y;return [x,y];};
 const before=bez(sq,0,0.5),moved=reshapeSegment(sq,0,0.5,0,-0.1),after=bez(moved as unknown as typeof sq,0,0.5);
 assert.ok(Math.abs(after[0]-before[0])<1e-3&&Math.abs(after[1]-(before[1]-0.1))<1e-3,'curve point at u follows the drag');
 assert.deepEqual(moved.points[2],sq.points[2],'other points untouched');assert.ok(moved.points[0].outY!==undefined&&moved.points[1].inY!==undefined);
 let d=squareDoc();const r=d.revision;d=applyEdit(d,pathLayerEdit(d,'pa',{op:'segment',index:0,u:0.5,dx:0,dy:-0.1}));assert.equal(d.revision,r+1);assert.match(layerPathD(layer(d,'pa'),0),/C/);
 const huge=reshapeSegment(sq,0,0.5,5,5);assert.equal(huge.points[0].outX,2,'handles bounded');
 assert.throws(()=>pathLayerEdit(d,'pa',{op:'segment',index:9,u:0.5,dx:0,dy:0}),/no longer/);
 let open=pathDoc();open=applyEdit(open,{type:'layer.update',layer:'pa',source:{path:{closed:false,points:[{x:0.1,y:0.5},{x:0.9,y:0.5}]}}});assert.throws(()=>pathLayerEdit(open,'pa',{op:'segment',index:1,u:0.5,dx:0,dy:0}),/no longer/,'open path has no closing segment');
});

import {pathSubpaths,layerFillRule,combinePathsEdits} from './pathLayer';
import {MAX_SUBPATHS,MAX_COMPOUND_POINTS} from './model';
test('P31: legacy path layers read as one subpath and render and round-trip unchanged',()=>{
 const d=pathDoc(),l=layer(d,'pa');assert.equal(l.source.subpaths,undefined);assert.equal(pathSubpaths(l.source).length,1);assert.equal(layerFillRule(l),undefined);
 assert.equal(layerPathD(l,0),pathData(l.source.path as never,200,100),'legacy output byte for byte');
 const back=parseAnimationSnapshot(serializeAnimationSnapshot(d,defaultView())).doc;assert.equal(layer(back,'pa').source.subpaths,undefined);
 assert.doesNotMatch(frameSvg(comp(d),0),/fill-rule/);
});
test('P31: compound paths validate, render with even-odd and round-trip; bounds hold',()=>{
 let d=pathDoc();const hole={closed:true,points:[{x:0.4,y:0.4},{x:0.6,y:0.4},{x:0.5,y:0.6}]};
 const r=d.revision;d=applyEdit(d,pathLayerEdit(d,'pa',{op:'addSubpath',path:hole}));assert.equal(d.revision,r+1);
 const l=layer(d,'pa');assert.equal(pathSubpaths(l.source).length,2);assert.equal(layerFillRule(l),'evenodd');assert.equal((layerPathD(l,0).match(/M/g)??[]).length,2);
 assert.match(frameSvg(comp(d),0),/fill-rule="evenodd"/);assert.ok(validateDocument(d));
 const back=parseAnimationSnapshot(serializeAnimationSnapshot(d,defaultView())).doc;assert.equal(layer(back,'pa').source.subpaths!.length,1);
 assert.throws(()=>applyEdit(d,{type:'layer.update',layer:'pa',source:{subpaths:[{closed:true,points:[{x:2,y:0},{x:0,y:0}]}]}}),EditError,'points stay in the box');
 assert.throws(()=>applyEdit(d,{type:'layer.update',layer:'photo',source:{subpaths:[hole]}}),EditError,'path shapes only');
 assert.throws(()=>applyEdit(d,{type:'layer.update',layer:'pa',source:{subpaths:[]}}),EditError,'empty list is not a compound');
 assert.throws(()=>pathLayerEdit(d,'pa',{op:'animate',on:true}),/Compound/);assert.throws(()=>pathLayerEdit(d,'pa',{op:'morphTo',other:'pb',t:Math.round(sec*2)}),/Compound/);
 let m=d;for(let i=0;i<MAX_SUBPATHS-2;i++)m=applyEdit(m,pathLayerEdit(m,'pa',{op:'addSubpath',path:hole}));assert.equal(pathSubpaths(layer(m,'pa').source).length,MAX_SUBPATHS);
 assert.throws(()=>applyEdit(m,pathLayerEdit(m,'pa',{op:'addSubpath',path:hole})),EditError,'subpath count bounded');
 assert.ok(MAX_COMPOUND_POINTS===512);
 let big=pathDoc();const many={closed:false,points:Array.from({length:200},(_,i)=>({x:i/200,y:0.5}))};
 big=applyEdit(big,pathLayerEdit(big,'pa',{op:'addSubpath',path:many}));big=applyEdit(big,pathLayerEdit(big,'pa',{op:'addSubpath',path:many}));
 assert.throws(()=>applyEdit(big,pathLayerEdit(big,'pa',{op:'addSubpath',path:many})),EditError,'total points bounded');
 const x=applyEdit(d,pathLayerEdit(d,'pa',{op:'removeSubpath',index:1}));assert.equal(layer(x,'pa').source.subpaths,undefined);assert.throws(()=>pathLayerEdit(x,'pa',{op:'removeSubpath',index:1}),/no longer/);
 const dd=applyEdit(d,pathLayerEdit(d,'pa',{op:'animate',on:false})); void dd;
});
test('P31: combining path layers keeps shapes in place, is one undo, and refuses unsafe cases',()=>{
 let d=pathDoc();const base0=layer(d,'pa').transform.position.value as unknown as number[];d=applyEdit(d,{type:'prop.set',layer:'pb',prop:'position',value:[base0[0]+10,base0[1]],t:0});
 const before=(layer(d,'pb').transform.position.value as unknown as number[]),r=d.revision;
 const edits=combinePathsEdits(d,'pa','pb');d=applyEdits(d,edits);assert.equal(d.revision,r+1,'one undo step');assert.equal(findLayer(comp(d),'pb'),undefined,'other layer removed');
 const sp=layer(d,'pa').source.subpaths!;assert.equal(sp.length,1);
 const pa=layer(d,'pa').transform.position.value as unknown as number[];const x0=(before[0]-pa[0]+0.1*200)/200;assert.ok(Math.abs(sp[0].points[0].x-x0)<1e-3,'placed by world position');
 assert.throws(()=>combinePathsEdits(d,'pa','pa'),/another/);assert.throws(()=>combinePathsEdits(d,'pa','photo'),/path shape layer/);
 let far=pathDoc();far=applyEdit(far,{type:'prop.set',layer:'pb',prop:'position',value:[5000,0],t:0});assert.throws(()=>combinePathsEdits(far,'pa','pb'),/leave this layer box/);
 let an=pathDoc();an=applyEdit(an,pathLayerEdit(an,'pb',{op:'animate',on:true}));assert.throws(()=>combinePathsEdits(an,'pa','pb'),/animation/);
 let lk=pathDoc();lk=applyEdit(lk,{type:'layer.update',layer:'pa',locked:true});assert.throws(()=>combinePathsEdits(lk,'pa','pb'),/locked/);
});
test('P31: compound path locale keys and command exist',()=>{
 assert.ok(animationCommandSpecs().some(s=>s.id==='animation.layer.pathCombine'));
 for(const l of ['en','de','es','fr','pt-BR']){const j=JSON.parse(readFileSync(new URL(`../../locales/animation/${l}.json`,import.meta.url),'utf8'));for(const k of ['animation.pathLayer.combine','animation.pathLayer.combineTarget','animation.pathLayer.subpaths','animation.pathLayer.removeSubpath','cmd.animation.layer.pathCombine'])assert.ok(j[k],`${l} ${k}`);}
});

const rect=(x0:number,y0:number,x1:number,y1:number)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const boolDoc=(a:ReturnType<typeof rect>,b:ReturnType<typeof rect>)=>{let d=pathDoc();
 d=applyEdit(d,{type:'layer.update',layer:'pa',source:{path:{closed:true,points:a}}});d=applyEdit(d,{type:'layer.update',layer:'pb',source:{path:{closed:true,points:b}}});return d;};
/** Even-odd area in pixels of a layer's subpaths (nested rings subtract). */
const eoArea=(d:AnimationDocument,id:string)=>{const l=layer(d,id);const rs=[l.source.path!,...(l.source.subpaths??[])].map(q=>q.points.map(p=>[p.x*200,p.y*100] as Pt));
 const inR=(r:Pt[],p:Pt)=>{let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;};
 return rs.reduce((n,r,i)=>{const depth=rs.filter((o,k)=>k!==i&&inR(o,r[0])).length;return n+(depth%2?-1:1)*Math.abs(ringArea(r));},0);};
test('P32: booleans of overlapping squares have the known areas',()=>{
 const A=rect(0,0,0.5,0.5),B=rect(0.25,0.25,0.75,0.75);
 const want:Record<BoolOp,number>={unite:8750,intersect:1250,subtract:3750,exclude:7500};
 for(const op of Object.keys(want) as BoolOp[]){const d0=boolDoc(A,B),r=d0.revision;const d=applyEdits(d0,booleanEdits(d0,'pa','pb',op));
  assert.equal(d.revision,r+1,'one undo step');assert.equal(findLayer(comp(d),'pb'),undefined);assert.ok(Math.abs(eoArea(d,'pa')-want[op])<1,`${op} ${eoArea(d,'pa')}`);assert.deepEqual(validateDocument(d),validateDocument(d0));}
});
test('P32: hole, disjoint, contained, touching and empty results',()=>{
 let d0=boolDoc(rect(0,0,1,1),rect(0.25,0.25,0.75,0.75));let d=applyEdits(d0,booleanEdits(d0,'pa','pb','subtract'));
 assert.equal(layer(d,'pa').source.subpaths!.length,1,'hole is a second subpath');assert.ok(Math.abs(eoArea(d,'pa')-15000)<1);
 d0=boolDoc(rect(0,0,0.25,0.25),rect(0.5,0.5,1,1));d=applyEdits(d0,booleanEdits(d0,'pa','pb','unite'));assert.equal(layer(d,'pa').source.subpaths!.length,1);assert.ok(Math.abs(eoArea(d,'pa')-(50*25+100*50))<1);
 assert.throws(()=>booleanEdits(d0,'pa','pb','intersect'),/empty/);
 d0=boolDoc(rect(0,0.2,0.4,0.8),rect(0.4,0.2,0.8,0.8));d=applyEdits(d0,booleanEdits(d0,'pa','pb','unite'));assert.equal(layer(d,'pa').source.subpaths,undefined,'shared edge merges');assert.equal(layer(d,'pa').source.path!.points.length,4);assert.ok(Math.abs(eoArea(d,'pa')-160*60)<1);
 d0=boolDoc(rect(0,0,0.5,0.5),rect(0,0,0.5,0.5));assert.throws(()=>booleanEdits(d0,'pa','pb','subtract'),/empty/);
 d0=boolDoc(rect(0,0,0.5,0.5),rect(0.1,0.1,0.3,0.3));d=applyEdits(d0,booleanEdits(d0,'pa','pb','intersect'));assert.ok(Math.abs(eoArea(d,'pa')-40*20)<1,'contained');
});
test('P32: curves are flattened within tolerance and refusals hold',()=>{
 const circ={closed:true,points:[{x:0.5,y:0,inX:-0.276,outX:0.276},{x:1,y:0.5,inY:-0.276,outY:0.276},{x:0.5,y:1,inX:0.276,outX:-0.276},{x:0,y:0.5,inY:0.276,outY:-0.276}]};
 const ring=flattenRing(circ,100,100);assert.ok(ring.length>8&&ring.length<=4*24);
 const hr=ring.reduce((m,p)=>Math.max(m,Math.abs(Math.hypot(p[0]-50,p[1]-50)-50)),0);assert.ok(hr<1,'on the circle');
 assert.ok(Math.abs(Math.abs(ringArea(ring))-Math.PI*2500)/(Math.PI*2500)<0.02);
 const r=booleanRings([ring],[[[0,0],[50,0],[50,100],[0,100]]],'intersect');assert.ok(Math.abs(Math.abs(ringArea(r[0]))-Math.PI*2500/2)/(Math.PI*1250)<0.03,'half disc');
 const A=rect(0,0,0.5,0.5),B=rect(0.25,0.25,0.75,0.75);
 let an=boolDoc(A,B);an=applyEdit(an,pathLayerEdit(an,'pb',{op:'animate',on:true}));assert.throws(()=>booleanEdits(an,'pa','pb','unite'),/animation/);
 let an2=boolDoc(A,B);an2=applyEdit(an2,pathLayerEdit(an2,'pa',{op:'animate',on:true}));assert.throws(()=>booleanEdits(an2,'pa','pb','unite'),/animation/);
 let lk=boolDoc(A,B);lk=applyEdit(lk,{type:'layer.update',layer:'pb',locked:true});assert.throws(()=>booleanEdits(lk,'pa','pb','unite'),/locked/);
 assert.throws(()=>booleanEdits(boolDoc(A,B),'pa','pa','unite'),/another/);assert.throws(()=>booleanEdits(boolDoc(A,B),'pa','photo','unite'),/path shape/);
 let far=boolDoc(A,B);far=applyEdit(far,{type:'prop.set',layer:'pb',prop:'position',value:[5000,0],t:0});assert.throws(()=>booleanEdits(far,'pa','pb','unite'),/leave this layer box/);
 let open=boolDoc(A,B);open=applyEdit(open,{type:'layer.update',layer:'pb',source:{path:{closed:false,points:B}}});assert.throws(()=>booleanEdits(open,'pa','pb','unite'),/closed/);
 const big=Array.from({length:1300},(_,i)=>[i,0] as Pt);assert.throws(()=>booleanRings([big],[big],'unite'),/too detailed/);
});
test('P32: boolean command and locale keys exist',()=>{
 assert.ok(animationCommandSpecs().some(s=>s.id==='animation.layer.pathBoolean'));
 for(const l of ['en','de','es','fr','pt-BR']){const j=JSON.parse(readFileSync(new URL(`../../locales/animation/${l}.json`,import.meta.url),'utf8'));for(const k of ['animation.pathLayer.boolOp','animation.pathLayer.bool.unite','animation.pathLayer.bool.subtract','animation.pathLayer.bool.intersect','animation.pathLayer.bool.exclude','animation.pathLayer.boolApply','cmd.animation.layer.pathBoolean'])assert.ok(j[k],`${l} ${k}`);}
});

const mk=(id:string,o:Partial<import('./model').LayerMask>):import('./model').LayerMask=>({id,shape:'rect',mode:'add',x:0,y:0,width:100,height:100,feather:0,invert:false,...o});
const maskDoc=(a:Partial<import('./model').LayerMask>,b:Partial<import('./model').LayerMask>)=>applyEdit(base(),{type:'layer.masks',layer:'photo',masks:[mk('ma',a),mk('mb',b)]});
const maskArea=(d:AnimationDocument)=>{const m=layer(d,'photo').masks!.find(x=>x.id==='ma')!;return Math.abs(ringArea(m.path!.points.map(p=>[p.x+m.x,p.y+m.y] as Pt)));};
test('P33: mask booleans have the known areas, one undo, one mask left',()=>{
 const want:Record<BoolOp,number>={unite:17500,intersect:2500,subtract:7500,exclude:15000};
 for(const op of Object.keys(want) as BoolOp[]){const d0=maskDoc({},{x:50,y:50}),r=d0.revision;const d=applyEdit(d0,maskBooleanEdit(d0,'photo','ma','mb',op));
  assert.equal(d.revision,r+1,'one undo step');assert.equal(layer(d,'photo').masks!.length,1);assert.equal(layer(d,'photo').masks![0].shape,'path');assert.ok(Math.abs(maskArea(d)-want[op])<1,`${op} ${maskArea(d)}`);validateDocument(d);}
 let d0=maskDoc({shape:'ellipse'},{x:0,y:0,width:50,height:100});const d=applyEdit(d0,maskBooleanEdit(d0,'photo','ma','mb','intersect'));
 assert.ok(layer(d,'photo').masks![0].path!.points.length<=32);assert.ok(Math.abs(maskArea(d)-Math.PI*2500/2)/(Math.PI*1250)<0.03,'half disc '+maskArea(d));
 d0=maskDoc({shape:'ellipse'},{x:50,y:0});const u=applyEdit(d0,maskBooleanEdit(d0,'photo','ma','mb','unite')),ua=maskArea(u);assert.ok(Math.abs(ua-(10000+Math.PI*1250))/13927<0.01,'ellipse union '+ua);
});
test('P33: mask boolean refusals',()=>{
 const E=(d:AnimationDocument,re:RegExp,op:BoolOp='unite')=>assert.throws(()=>maskBooleanEdit(d,'photo','ma','mb',op),re);
 E(maskDoc({},{x:300,y:300}),/empty/,'intersect');
 E(maskDoc({},{x:300,y:300}),/several parts/);
 E(maskDoc({width:100,height:100},{x:25,y:25,width:50,height:50}),/several parts/,'subtract');
 E(maskDoc({invert:true},{x:50}),/Inverted/);E(maskDoc({mode:'subtract'},{x:50}),/same mode/);
 E(maskDoc({},{x:50,shape:'path',path:{closed:false,points:[{x:0,y:0},{x:10,y:0},{x:10,y:10}]}}),/closed/);
 let d=maskDoc({},{x:50});d=applyEdit(d,maskEdit(d,'photo',{op:'animate',mask:'ma',prop:'position',on:true,t:0}));E(d,/animation/);
 d=maskDoc({},{x:50});d=applyEdit(d,{type:'layer.update',layer:'photo',locked:true});E(d,/locked/);
 assert.throws(()=>maskBooleanEdit(maskDoc({},{x:50}),'photo','ma','ma','unite'),/another/);
 assert.throws(()=>maskBooleanEdit(maskDoc({},{x:50}),'photo','ma','zz','unite'),/no longer/);
});
const gArea=(d:AnimationDocument,id:string)=>{const l=layer(d,id);const W=l.source.width!,H=l.source.height!;const rs=[l.source.path!,...(l.source.subpaths??[])].map(q=>q.points.map(p=>[p.x*W,p.y*H] as Pt));
 const inR=(r:Pt[],p:Pt)=>{let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;};
 return rs.reduce((n,r,i)=>n+(rs.filter((o,k)=>k!==i&&inR(o,r[0])).length%2?-1:1)*Math.abs(ringArea(r)),0);};
const strokeDoc=(pts:{x:number;y:number;outX?:number;outY?:number;inX?:number;inY?:number}[],closed:boolean,width=10)=>{let d=pathDoc();
 d=applyEdit(d,{type:'layer.update',layer:'pa',source:{path:{closed,points:pts}}});return applyEdit(d,{type:'layer.stroke',layer:'pa',stroke:{color:'#00ff00',width}});};
test('P33: expand stroke makes a filled outline layer with the known area, one undo',()=>{
 let d0=strokeDoc([{x:0.1,y:0.5},{x:0.9,y:0.5}],false);let r=d0.revision;let d=applyEdits(d0,expandStrokeEdits(d0,'pa','out'));
 assert.equal(d.revision,r+1,'one undo step');assert.equal(layer(d,'pa').stroke,undefined);assert.equal(layer(d,'out').source.color,'#00ff00');assert.equal(layer(d,'out').source.path!.points.length,4);assert.ok(Math.abs(gArea(d,'out')-1600)<1,'line '+gArea(d,'out'));
 d0=strokeDoc([{x:0.25,y:0.2},{x:0.75,y:0.2},{x:0.75,y:0.8},{x:0.25,y:0.8}],true);d=applyEdits(d0,expandStrokeEdits(d0,'pa','out'));
 assert.equal(layer(d,'out').source.subpaths!.length,1,'outer and inner ring');assert.ok(Math.abs(gArea(d,'out')-3200)<2,'square ring '+gArea(d,'out'));
 const o=layer(d0,'pa').transform.anchor.value as unknown as number[],n=layer(d,'out').transform.anchor.value as unknown as number[];assert.ok(Math.abs(o[0]-n[0]-45)<1&&Math.abs(o[1]-n[1]-15)<1,'anchor shifted so the outline keeps its place');
 validateDocument(d);
 const k=0.5523;d0=strokeDoc([{x:0.5,y:0.1,inX:-0.2*k,outX:0.2*k},{x:0.7,y:0.5,inY:-0.4*k,outY:0.4*k},{x:0.5,y:0.9,inX:0.2*k,outX:-0.2*k},{x:0.3,y:0.5,inY:0.4*k,outY:-0.4*k}],true);
 d=applyEdits(d0,expandStrokeEdits(d0,'pa','out'));const ra=40;assert.ok(Math.abs(gArea(d,'out')-Math.PI*((ra+5)**2-(ra-5)**2))/(Math.PI*800)<0.03,'circle ring '+gArea(d,'out'));
 const g=layer(d,'out');assert.ok(g.source.path!.points.length+g.source.subpaths!.reduce((n,q)=>n+q.points.length,0)<=512);
});
test('P33: expand stroke refusals and engine bounds',()=>{
 const sq=[{x:0.25,y:0.2},{x:0.75,y:0.2},{x:0.75,y:0.8},{x:0.25,y:0.8}];
 assert.throws(()=>expandStrokeEdits(pathDoc(),'pa'),/no stroke/);
 let d=strokeDoc(sq,true,0);assert.throws(()=>expandStrokeEdits(d,'pa'),/no stroke/);
 d=strokeDoc(sq,true);d=applyEdit(d,{type:'layer.stroke',layer:'pa',stroke:{color:'#00ff00',width:4,dash:{type:'scalar',value:0,keys:[]} as never}});assert.throws(()=>expandStrokeEdits(d,'pa'),/trim and dash/);
 d=strokeDoc(sq,true);d=applyEdit(d,pathLayerEdit(d,'pa',{op:'animate',on:true}));assert.throws(()=>expandStrokeEdits(d,'pa'),/animation/);
 d=strokeDoc(sq,true);d=applyEdit(d,{type:'layer.update',layer:'pa',locked:true});assert.throws(()=>expandStrokeEdits(d,'pa'),/locked/);
 assert.throws(()=>expandStrokeEdits(applyEdit(strokeDoc(sq,true),{type:'layer.stroke',layer:'pa',stroke:{color:'#00ff00',width:4}}),'photo'),/path|stroke|shape/i);
 const many=Array.from({length:40},(_,i)=>({x:(i%2?0.9:0.1),y:0.05+i*0.02,outX:0.4,outY:0.3,inX:-0.4,inY:-0.3}));assert.throws(()=>expandStrokeEdits(strokeDoc(many,false),'pa'),/too detailed/);
 assert.equal(strokeOutline([{pts:[[0,0],[0,0]],closed:false}],4).length,0);
 assert.equal(simplifyRing([[0,0],[5,0.1],[10,0],[10,10],[0,10]],0.5).length,4);
});
test('P33: new commands and locale keys exist, layer.stroke null removes the stroke',()=>{
 for(const id of ['animation.mask.boolean','animation.layer.expandStroke'])assert.ok(animationCommandSpecs().some(s=>s.id===id));
 for(const l of ['en','de','es','fr','pt-BR']){const j=JSON.parse(readFileSync(new URL(`../../locales/animation/${l}.json`,import.meta.url),'utf8'));for(const k of ['animation.masks.boolOther','animation.masks.maskN','animation.pathLayer.expandStroke','cmd.animation.mask.boolean','cmd.animation.layer.expandStroke'])assert.ok(j[k],`${l} ${k}`);}
 let d=pathDoc();d=applyEdit(d,{type:'layer.stroke',layer:'pa',stroke:{color:'#00ff00',width:2}});assert.ok(layer(d,'pa').stroke);d=applyEdit(d,{type:'layer.stroke',layer:'pa',stroke:null});assert.equal(layer(d,'pa').stroke,undefined);
});
