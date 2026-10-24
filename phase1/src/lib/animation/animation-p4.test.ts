import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,validateDocument,type AnimationDocument} from './model';
import {applyEdit,applyEdits} from './edit';
import {worldMatrix,decomposeMatrix} from './scene';
import {effectColor,effectBypassed,effectPrimitives,strokeAttributes} from './effects';
import {presetEdits} from './presets';
import {frameSvg,exportSequenceZip,MAX_ZIP_BYTES,MAX_FRAMES} from './exportFrames';
import {TICKS_PER_SECOND as sec} from './time';
const base=()=>applyEdits(createDocument(),[{type:'layer.add',kind:'shape',id:'shape'},{type:'layer.add',kind:'null',id:'parent'},{type:'prop.set',layer:'parent',prop:'position',value:[100,300],t:0}]);
const layer=(d:AnimationDocument)=>findComp(d)!.layers.find(l=>l.id==='shape')!;
const close=(a:readonly number[],b:readonly number[])=>a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<1e-6,`${x} != ${b[i]}`));
test('keep-world reparent/detach preserves every matrix component for representable static transforms',()=>{
 let d=base();d=applyEdits(d,[{type:'prop.set',layer:'parent',prop:'rotation',value:30,t:0},{type:'prop.set',layer:'parent',prop:'scale',value:[200,200],t:0},{type:'prop.set',layer:'shape',prop:'anchor',value:[80,40],t:0}]);const world=worldMatrix(findComp(d)!,layer(d),0);
 d=applyEdit(d,{type:'layer.parent',layer:'shape',parent:'parent',keepWorld:true,t:0});close(worldMatrix(findComp(d)!,layer(d),0),world);d=applyEdit(d,{type:'layer.parent',layer:'shape',parent:null,keepWorld:true,t:0});close(worldMatrix(findComp(d)!,layer(d),0),world);
});
test('keep-world refuses singular parents, unrepresentable shear and animated anchors, no approximation',()=>{
 let d=base();d=applyEdit(base(),{type:'prop.set',layer:'parent',prop:'scale',value:[0,100],t:0});assert.throws(()=>applyEdit(d,{type:'layer.parent',layer:'shape',parent:'parent',keepWorld:true,t:0}),/singular/);
 d=applyEdits(base(),[{type:'prop.animate',layer:'shape',prop:'anchor',on:true,t:0},{type:'prop.set',layer:'shape',prop:'anchor',value:[10,10],t:sec}]);assert.throws(()=>applyEdit(d,{type:'layer.parent',layer:'shape',parent:'parent',keepWorld:true,t:0}),/anchor/);
 assert.equal(decomposeMatrix([1,0,1,1,0,0],[0,0]),null);assert.equal(decomposeMatrix([-1,0,0,1,0,0],[0,0]),null);
});
test('tint colour interpolation is RGB-linear and bypass uses hold keys at exact times',()=>{
 let d=applyEdit(base(),{type:'layer.effects',layer:'shape',effects:[{id:'t',kind:'tint',enabled:true,amount:1,color:'#ffffff'}]});d=applyEdits(d,[{type:'effect.colorKey',layer:'shape',effect:'t',color:'#ff0000',t:0},{type:'effect.colorKey',layer:'shape',effect:'t',color:'#0000ff',t:sec},{type:'effect.bypassKey',layer:'shape',effect:'t',bypass:true,t:sec},{type:'effect.bypassKey',layer:'shape',effect:'t',bypass:false,t:sec*2}]);const e=layer(d).effects![0];assert.equal(effectColor(e,sec/2),'#800080');assert.equal(effectBypassed(e,sec-1),false);assert.equal(effectBypassed(e,sec),true);assert.equal(effectPrimitives(layer(d),sec),'');assert.equal(effectBypassed(e,sec*2),false);assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(d))),[]);
 assert.throws(()=>applyEdit(d,{type:'effect.colorKey',layer:'shape',effect:'t',color:'url(evil)',t:0}));
});
test('trim/dash presets animate outline only and preserve path geometry',()=>{
 let d=applyEdit(base(),{type:'layer.update',layer:'shape',source:{shape:'path',path:{points:[{x:0,y:0},{x:1,y:1},{x:0,y:1}],closed:true}}});d=applyEdits(d,presetEdits(d,'shape','trim',0));d=applyEdits(d,presetEdits(d,'shape','dash',0));assert.equal(strokeAttributes(layer(d),0)!.strokeDasharray,'0 100');assert.equal(strokeAttributes(layer(d),sec/2)!.strokeDasharray,'50 100');assert.equal(strokeAttributes(layer(d),sec/2)!.strokeDashoffset,50);const svg=frameSvg(findComp(d)!,sec/2);assert.ok(svg.includes('<path d="M'));assert.ok(svg.includes('pathLength="100"'));assert.deepEqual(validateDocument(d),[]);assert.throws(()=>presetEdits(d,'shape','trim',0));
 assert.throws(()=>applyEdit(d,{type:'layer.update',layer:'shape',source:{path:{points:[{x:0,y:0},{x:Infinity,y:1}],closed:true}}}));
});
test('PNG sequence is bounded and cancellation during rasterisation cannot publish a partial result',async()=>{
 assert.equal(MAX_ZIP_BYTES,64*1024*1024);assert.equal(MAX_FRAMES,1800);const ctl=new AbortController();let progress=0;
 await assert.rejects(exportSequenceZip({...findComp(base())!,workArea:{in:0,out:sec}},'cancel',{signal:ctl.signal,rasterize:async()=>{ctl.abort();return new Uint8Array([1]);},onProgress:()=>progress++}),e=>(e as {code:string}).code==='cancelled');assert.equal(progress,0);
});
test('source-space filter bounds include stroke extent so trace output is not clipped',async()=>{
 const {effectBounds}=await import('./effects');const d=applyEdits(base(),presetEdits(base(),'shape','trim',0));const bounds=effectBounds(layer(d));assert.equal(bounds.x,-6);assert.equal(bounds.width,412);
});
