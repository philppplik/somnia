import {CraftEngine} from './engine';
export interface CraftLayerInfo{id:string;name:string;visible:boolean;opacity:number;mask:boolean}
export interface CraftLayerQuery{width:number;height:number;layers:CraftLayerInfo[];undo:number;redo:number}
/** A source tab owns one worker and its bounded retained document. */
export class LayerSession{
 private engine=new CraftEngine();private docId=0;private saved='';private pixelHash=0;query:CraftLayerQuery|null=null;
 static async open(canvas:HTMLCanvasElement){if(canvas.width*canvas.height>1_048_576)throw Error('Layer documents are limited to 1 MP until tiled storage is ready.');const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext('2d')!;ctx.drawImage(canvas,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);const s=new LayerSession();try{await s.engine.init();const r=await s.engine.openDocument(pixels.data.buffer,canvas.width,canvas.height);if(!r.ok||r.kind!=='document')throw Error('Invalid layer document response');s.docId=r.docId;s.query=JSON.parse(r.query);await s.render();s.markSaved();return s;}catch(e){s.dispose();throw e;}}
 get dirty(){return this.signature()!==this.saved;}
 private signature(){return JSON.stringify([this.query?.layers??[],this.pixelHash]);}
 markSaved(){this.saved=this.signature();}
 async command(command:'duplicate'|'visible'|'opacity'|'mask'|'clear-mask'|'undo'|'redo',index?:number,value?:boolean|number,bytes?:ArrayBuffer){const r=await this.engine.documentCommand(this.docId,command,{index,value,bytes});if(!r.ok||r.kind!=='document')throw Error('Invalid layer command response');this.query=JSON.parse(r.query);}
 async render(){const r=await this.engine.documentCommand(this.docId,'render');if(!r.ok||r.kind!=='document'||!r.bytes)throw Error('Invalid layer render response');this.query=JSON.parse(r.query);let hash=2166136261;for(const byte of new Uint8Array(r.bytes))hash=Math.imul(hash^byte,16777619)>>>0;this.pixelHash=hash;const q=this.query!;const canvas=document.createElement('canvas');canvas.width=q.width;canvas.height=q.height;canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.bytes),q.width,q.height),0,0);return canvas;}
 dispose(){this.engine.dispose();}
}
