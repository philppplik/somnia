import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,findLayer,validateDocument,MAX_LAYER_MASKS,type AnimationDocument} from './model';
import {applyEdit,applyEdits,EditError} from './edit';
import {maskEdit,matteEdit,maskPath,copyMaskKey,insertPoint,handleMaskKey,copyMaskKeys} from './masks';
import {animatedChars,animatorEdit,defaultAnimator,mixHex} from './textAnimators';
import {copyTransformKeys,pasteTransformEdits} from './keysClipboard';
import {animatedTargets,allTargetKeys,propertyOf,moveTargetKeys,easeTargetKeys,pruneTargetKeys,toggleTargetKey,editTargetKeys,copyTargetKeys,pasteTargetKeys,deleteTargetKeys} from './keyTargets';
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
 selectMask(null,null);assert.equal(activeMask(l,{layer:null,mask:null,point:null,pen:false,clip:null,graph:null,mixed:false})!.id,'m');
 assert.equal(activeMask(l,{layer:'other',mask:'zzz',point:null,pen:false,clip:null,graph:null,mixed:false})!.id,'m');assert.equal(activeMask(undefined,{layer:null,mask:null,point:null,pen:false,clip:null,graph:null,mixed:false}),undefined);
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
