import {diagnosePptx} from './diagnostics';
import {readRuns,makeEditedCopy} from './editCopy';
/// <reference lib="webworker" />
import init,{SlidesEngine} from '../../../slides-engine/pkg/somnia_slides.js';
import {setSlideTransition,arrangeShapes,setShapesBounds,insertPicture,replacePicture,removePicture,formatShapeText,addTextBox,removeTextBox,readDeckModel,moveSlide,setShapeBounds,duplicateSlide,deleteSlide,newSlideFromLayout,readLayouts} from './deckPackage';
import type {SlidesRequest,SlidesReply} from './protocol';
let engine:SlidesEngine|undefined;let wasmMemory:WebAssembly.Memory|undefined;
// Serialize even asynchronous initialization. No user-defined method invocation.
let queue=Promise.resolve();
self.onmessage=({data}:{data:SlidesRequest})=>{queue=queue.then(async()=>{
 try{
  let result:SlidesReply['result'];
  switch(data.op){
   case 'init':wasmMemory=(await init()).memory;engine?.free();engine=new SlidesEngine();result=true;break;
   case 'open':if(!engine)throw new Error('Worker not initialized');result=JSON.parse(engine.open(data.bytes));break;
   case 'memory':result={wasmBytes:wasmMemory?.buffer.byteLength??0};break;
   case 'diagnostics':result=diagnosePptx(data.bytes);break;
   case 'runs':result=readRuns(data.bytes);break;
   case 'copy':result=makeEditedCopy(data.bytes,data.edits);break;
   case 'model':result=readDeckModel(data.bytes);break;
   case 'reorder':result=moveSlide(data.bytes,data.slideId,data.toIndex);break;
   case 'layouts':result=readLayouts(data.bytes);break;
   case 'shapeBounds':result=setShapeBounds(data.bytes,data.slideId,data.shapeId,data.expected,data.next);break;
   case 'shapesBounds':result=setShapesBounds(data.bytes,data.slideId,data.edits);break;
   case 'arrange':result=arrangeShapes(data.bytes,data.slideId,data.shapeIds,data.mode);break;
   case 'transition':result=setSlideTransition(data.bytes,data.slideId,data.transition);break;
   case 'formatText':result=formatShapeText(data.bytes,data.slideId,data.shapeId,data.format);break;
   case 'boxEdit':result=data.kind==='add'?addTextBox(data.bytes,data.slideId,data.label):removeTextBox(data.bytes,data.slideId,data.shapeId);break;
   case 'pictureEdit':result=data.kind==='insert'?insertPicture(data.bytes,data.slideId,data.image,data.alt):data.kind==='replace'?replacePicture(data.bytes,data.slideId,data.shapeId,data.image):removePicture(data.bytes,data.slideId,data.shapeId);break;
   case 'slideEdit':result=data.kind==='duplicate'?duplicateSlide(data.bytes,data.slideId):deleteSlide(data.bytes,data.slideId);break;
   case 'newSlide':result=newSlideFromLayout(data.bytes,data.layoutPart,data.afterSlideId);break;
   case 'read':if(!engine)throw new Error('Worker not initialized');result=JSON.parse(engine.read_slide(data.index));break;
   case 'render':if(!engine)throw new Error('Worker not initialized');result=engine.render_png(data.index,data.scale);break;
   default:throw new Error('Unknown Slides operation');
  }
  self.postMessage({id:data.id,result},result instanceof Uint8Array?[result.buffer]:[]);
 }catch(error){self.postMessage({id:data.id,error:String(error)});}
});};
