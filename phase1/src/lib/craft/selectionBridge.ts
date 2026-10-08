import type {RasterImage} from '../image/buffer';
import type {Point} from '../image-editor/types';
import {emptySelection,lassoSelection,wandSelection,type SelectionMask} from '../imgedit/select';
import type {CraftEngine} from './engine';
/** Preserve image-space binary mask contract; no proxy coordinates reach this bridge. */
export class CraftSelectionBridge{
 private engine?:CraftEngine;private ready?:Promise<unknown>;private disposed=false;
 constructor(private report:(message:string)=>void){}
 async select(image:RasterImage,tool:'wand'|'lasso',points:readonly Point[],tolerance:number):Promise<SelectionMask>{
  if(this.disposed)throw Error('Selection bridge disposed');
  const fallback=()=>tool==='wand'?(points[0]?wandSelection(image,points[0],tolerance):emptySelection(image.width,image.height)):lassoSelection(image.width,image.height,points);
  if(image.width*image.height>1_048_576||points.length>4096){this.report('Selection exceeds PhotoCraft worker bounds. Using existing image-space selection.');return fallback();}
  if(tool==='wand'&&(!points[0]||points[0].x<0||points[0].y<0||points[0].x>=image.width||points[0].y>=image.height))return emptySelection(image.width,image.height);
  if(tool==='lasso'&&points.length<3)return emptySelection(image.width,image.height);
  try{
   if(!this.engine){const {CraftEngine}=await import('./engine');if(this.disposed)throw Error('Selection bridge disposed');this.engine=new CraftEngine();this.ready=this.engine.init();}
   await this.ready;const result=await this.engine.selection(tool==='wand'?{tool:'wand',width:image.width,height:image.height,x:Math.floor(points[0].x),y:Math.floor(points[0].y),tolerance,bytes:new Uint8Array(image.data).buffer}:{tool:'polygon',width:image.width,height:image.height,points:points.flatMap(p=>[p.x,p.y])});
   if(this.disposed)throw Error('Selection bridge disposed');if(!result.ok||result.kind!=='result'||result.bytes.byteLength!==image.width*image.height)throw Error('Invalid selection worker response');
   return {width:image.width,height:image.height,data:new Uint8Array(result.bytes).map(v=>v>=128?1:0)};
  }catch(e){if(this.disposed)throw e;this.report('PhotoCraft selection unavailable. Using existing image-space selection.');return fallback();}
 }
 dispose(){this.disposed=true;this.engine?.dispose();}
}
