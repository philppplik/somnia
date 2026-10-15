import test from 'node:test';
import assert from 'node:assert/strict';
import {DocumentsCore} from './core';
import {imageWrapProblem,IMAGE_WRAPS,IMAGE_ALIGNS} from './protocol';
test('picture wrap and side are validated',()=>{
 for(const w of IMAGE_WRAPS)for(const a of IMAGE_ALIGNS)assert.equal(imageWrapProblem(w,a),null);
 for(const [w,a] of [['tight','left'],['square','middle'],['',''],[1,'left'],[null,null],['square',undefined]])assert.notEqual(imageWrapProblem(w,a),null,String([w,a]));
});
test('a wrap request reaches the engine once, only when valid',()=>{
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}paginate(){return 1;}page_info(){return '{"pages":[],"cacheHits":0,"cacheMisses":0}';}text(){return '';}set_image_wrap(b:number,w:string,a:string){calls.push(`${b} ${w} ${a}`);}};
 const k=new DocumentsCore(S as never);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 const send=(block:unknown,wrap:unknown,align:unknown)=>k.handle({id:2,kind:'imageEdit',block,op:{op:'wrap',wrap,align}} as never).res.ok;
 for(const [b,w,a] of [[-1,'square','left'],[1.5,'square','left'],[1,'tight','left'],[1,'square','top'],[1,'square',undefined]] as [unknown,unknown,unknown][])assert.equal(send(b,w,a),false);
 assert.deepEqual(calls,[]);
 assert.equal(send(2,'topAndBottom','center'),true);assert.deepEqual(calls,['2 topAndBottom center']);
});
import {imageCropProblem} from './protocol';
import {parseCrop} from '../../components/documents/ImageControls';
test('crop is bounded per side and per axis',()=>{
 for(const ok of [[0,0,0,0],[90,0,0,90],[45,10,45,80]])assert.equal(imageCropProblem(ok),null);
 for(const bad of [[-1,0,0,0],[91,0,0,0],[50,0,41,0],[0,50,0,41],[0,0,0],[0,0,0,0,0],'x',null,[Number.NaN,0,0,0],['1',0,0,0]])assert.notEqual(imageCropProblem(bad),null,JSON.stringify(bad));
 assert.deepEqual(parseCrop(['10','','2,5','0']),[10,0,2.5,0]);
 for(const bad of [['a','','',''],['100','','',''],['50','','50',''],['-1','','',''],['1.55','','','']])assert.equal(parseCrop(bad),null,bad.join());
});
test('a crop request reaches the engine once, only when valid',()=>{
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}paginate(){return 1;}page_info(){return '{"pages":[],"cacheHits":0,"cacheMisses":0}';}text(){return '';}set_image_crop(b:number,l:number,t:number,r:number,bo:number){calls.push([b,l,t,r,bo].join(' '));}};
 const k=new DocumentsCore(S as never);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 const send=(block:unknown,crop:unknown)=>k.handle({id:2,kind:'imageEdit',block,op:{op:'crop',crop}} as never).res.ok;
 for(const [b,c] of [[-1,[0,0,0,0]],[1,[91,0,0,0]],[1,[60,0,40,0]],[1,'x'],[1,[0,0,0]]] as [unknown,unknown][])assert.equal(send(b,c),false);
 assert.deepEqual(calls,[]);assert.equal(send(2,[10,0,5,0]),true);assert.deepEqual(calls,['2 10 0 5 0']);
});
