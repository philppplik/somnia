import type {ImageOperation} from '../image-editor/types';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createImageDocument,serializeDocument,withOperations} from '../image-editor/document';
import {createPhotoStudioRegistry,validatePhoto,renderPhoto,photoAdapter} from './photoStudio';
import {DocumentRegistry,PolicyGateway,TransactionManager} from './documentCore';
import {AgentProjectTools} from './projectTools';
const doc=createImageDocument({id:'source-1',name:'image.png',mime:'image/png',width:2,height:2});
const raster={width:2,height:2,data:new Uint8ClampedArray([200,40,10,255,30,200,80,128,10,60,240,255,220,150,40,0])};
const ref={documentId:'photo-1',path:'image.png',studioKind:'photo' as const,revision:0,adapter:'photo-stack-v1'};
test('native Photo read and bounded proposals never disclose pixels or URLs, no arbitrary image op',async()=>{
 let text=serializeDocument(doc);let previews=0;
 const registry=createPhotoStudioRegistry({snapshot:()=>({ref,text}),preview:async()=>{previews++;}});
 const tools=new AgentProjectTools({projectId:'p',files:()=>({'image.png':text}),allowed:()=>true},undefined,undefined,{registry,nativeOnly:true,nativePath:p=>p==='image.png'});
 const call=(name:string,args:object)=>tools.execute({id:'t',name,arguments:JSON.stringify(args)},new AbortController().signal);
 assert.deepEqual(tools.definitions().map(x=>x.name),['raster_inspect','raster_adjust','raster_filter','raster_crop']);
 const inspect=await call('raster_inspect',{});assert.match(inspect,/pixelsDisclosed.*false/);assert.ok(!inspect.includes('data:')&&!inspect.includes('blob:'));
 await call('raster_filter',{filter:'grayscale',strength:1});assert.equal(previews,1);assert.equal(tools.proposals()[0].before,text);assert.match(tools.proposals()[0].after,/grayscale/);
 await assert.rejects(call('raster_adjust',{brightness:2}),/Invalid/);
 await assert.rejects(call('raster_crop',{x:1,y:1,width:9,height:9}),/bounds/);
 await assert.rejects(call('raster_filter',{filter:'generative-fill',strength:1}),/Invalid/);
 await assert.rejects(call('raster_inspect',{upload:true}),/Unexpected/);
 await assert.rejects(call('write_file',{path:'image.png',content:'x'}),/Only scoped/);
});
test('CPU preview operations preserve source pixels and alpha, crop has exact dimensions',async()=>{
 const original=new Uint8ClampedArray(raster.data);
 const gray=serializeDocument(withOperations(doc,[{id:'g',type:'grayscale',version:1,enabled:true,params:{strength:1}}]));
 const output=await renderPhoto(raster,gray);assert.deepEqual(raster.data,original);assert.equal(output.data[0],output.data[1]);assert.equal(output.data[1],output.data[2]);assert.equal(output.data[7],128);assert.equal(output.data[15],0);
 const crop=serializeDocument(withOperations(doc,[{id:'c',type:'crop',version:1,enabled:true,params:{x:1,y:0,width:1,height:2}}]));const c=await renderPhoto(raster,crop);assert.equal(c.width,1);assert.equal(c.height,2);assert.equal(c.data[3],128);
 const ac=new AbortController();ac.abort();await assert.rejects(renderPhoto(raster,gray,ac.signal));
});
test('Photo adapter rejects unknown op, oversized output and bad crop',()=>{
 for(const op of ([{id:'x',type:'shell',version:1,enabled:true,params:{}},{id:'x',type:'crop',version:1,enabled:true,params:{x:-1,y:0,width:1,height:1}},{id:'x',type:'resize',version:1,enabled:true,params:{width:10000,height:10000}}] as ImageOperation[]))assert.throws(()=>validatePhoto(serializeDocument(withOperations(doc,[op]))));
});
test('same transaction manager stages rejects accepts and undoes Photo stack without pixel mutation',async()=>{
 let text=serializeDocument(doc);const registry=new DocumentRegistry([photoAdapter]);registry.sync({'image.png':text});const base=registry.snapshot('image.png').ref;const policy=new PolicyGateway();policy.grant({effect:'inspect',documentIds:[base.documentId]});
 let previous=text;const tx=new TransactionManager(registry,policy,{hold:async()=>{},canAccept:()=>true,apply:(_p,t)=>{previous=text;text=t;registry.sync({'image.png':text});},undo:()=>{text=previous;registry.sync({'image.png':text});}});
 const after=serializeDocument(withOperations(doc,[{id:'a',type:'adjust',version:1,enabled:true,params:{brightness:0.3,contrast:0,saturation:0,hue:0,temperature:0,highlights:0,shadows:0,curves:[{x:0,y:0},{x:1,y:1}]}}]));
 const rejected=tx.propose('r',base,after);tx.reject(rejected.id);assert.equal(text,serializeDocument(doc));
 const p=tx.propose('r',base,after);policy.grant({effect:'edit',documentIds:[base.documentId],proposalId:p.id});await tx.accept(p.id,after);assert.equal(text,after);tx.undo(p.id);assert.equal(text,serializeDocument(doc));assert.deepEqual(raster.data,new Uint8ClampedArray([200,40,10,255,30,200,80,128,10,60,240,255,220,150,40,0]));
});

test('Photo rejects oversized source even without operations and selection pixel ops',()=>{
 const big=createImageDocument({id:'big',name:'big.png',mime:'image/png',width:3000,height:3000});
 assert.throws(()=>validatePhoto(serializeDocument(big)),/4 megapixels/);
 assert.throws(()=>validatePhoto(serializeDocument(withOperations(doc,[{id:'selection',type:'selection-fill',version:1,enabled:true,params:{width:2,height:2,runs:[[0,1]],color:[255,0,0,255]}}]))),/Unsupported/);
});
