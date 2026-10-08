import { renderStack, OperationRegistry, type RasterImage } from './pipeline';
import type { LoadedImage } from './loader';
import type { ImageEditDocument } from './types';
import {CraftBlurPreview} from '../craft/blurPreview';
import {canProxy,previewOperations,previewSize} from './preview';
import { ImageGpuRenderer } from './webgl';
export interface RenderResult { canvas: HTMLCanvasElement; backend: 'cpu' | 'webgl2'; warning?: string; previewScale?:number }
function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context=canvas.getContext('2d');if(!context)throw new Error('Canvas2D is unavailable.');return context;
}
export function rasterToCanvas(raster: RasterImage): HTMLCanvasElement {
  const canvas=document.createElement('canvas');canvas.width=raster.width;canvas.height=raster.height;
  canvasContext(canvas).putImageData(new ImageData(new Uint8ClampedArray(raster.data),raster.width,raster.height),0,0);return canvas;
}
export function decodeRaster(source: LoadedImage): RasterImage {
  const {width,height}=source.document.source, canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Canvas2D is unavailable.');
  context.drawImage(source.bitmap,0,0,width,height);
  const data=context.getImageData(0,0,width,height).data;return {width,height,data};
}
/** Cache a bounded display proxy separately from the full-resolution export source. */
export class ImageEditorRenderer {
  private raster?: RasterImage;
  private proxy?:RasterImage;
  private craft?:CraftBlurPreview;
  private craftDisabled=false;
  private proxyRaster():RasterImage{if(this.proxy)return this.proxy;const size=previewSize(this.source.document.source.width,this.source.document.source.height);const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;const ctx=canvasContext(canvas);ctx.drawImage(this.source.bitmap,0,0,size.width,size.height);return this.proxy={width:size.width,height:size.height,data:ctx.getImageData(0,0,size.width,size.height).data};}
  private gpu?: ImageGpuRenderer;
  private gpuFailure?: string;
  private generation=0;
  private disposed=false;
  constructor(readonly source: LoadedImage, readonly registry: OperationRegistry,private report:(message:string)=>void=()=>{}) {}
  async render(doc: ImageEditDocument, options: {signal?:AbortSignal;preview?:boolean} = {}): Promise<RenderResult> {
    if(this.disposed)throw new Error('Image renderer has been disposed.');
    if(doc.source.id!==this.source.document.source.id)throw new Error('Wrong source for this renderer.');
    const generation=++this.generation;options.signal?.throwIfAborted();
    const sourceSize=previewSize(doc.source.width,doc.source.height);
    const proxy=options.preview&&sourceSize.scale<1&&canProxy(doc);
    const input=proxy?this.proxyRaster():undefined;
    const renderDoc=proxy?{...doc,source:{...doc.source,width:input!.width,height:input!.height},operations:previewOperations(doc.operations,sourceSize.scale)}:doc;
    const active=renderDoc.operations.filter(op=>op.enabled);
    // Unedited display uses the proxy; export still uses the original source.
    if(active.length===0) {
      const canvas=document.createElement('canvas');canvas.width=input?.width??doc.source.width;canvas.height=input?.height??doc.source.height;
      canvasContext(canvas).drawImage(this.source.bitmap,0,0,canvas.width,canvas.height);return {canvas,backend:'cpu',previewScale:proxy?sourceSize.scale:1};
    }
    const raster=input??(this.raster ||= decodeRaster(this.source));
    if(options.preview && active.every(op=>!!this.registry.get(op).fragmentShader)) {
      try {
        if(!this.gpu)this.gpu=new ImageGpuRenderer(document.createElement('canvas'));
        const fragments=active.map(op=>this.registry.get(op).fragmentShader!(op.params));
        return {canvas:this.gpu.render(raster,fragments),backend:'webgl2',previewScale:proxy?sourceSize.scale:1};
      } catch(error) { this.gpuFailure=error instanceof Error?error.message:String(error); }
    }
    // T1 supports Gaussian blur only. Other ops retain their existing handlers.
    // Keep this a preview path until full-resolution tiled craft export is proved.
    const previewRegistry=options.preview&&!this.craftDisabled?new OperationRegistry():this.registry;
    if(previewRegistry!==this.registry){
      for(const op of active){try{previewRegistry.get(op);continue;}catch{/* first occurrence */}
        const fallback=this.registry.get(op);
        if(op.type==='blur')previewRegistry.register({...fallback,apply:async(input,params,context)=>{
          const radius=Number(params.sigma??10)*Number(params.strength??1);
          try{this.craft??=new CraftBlurPreview(this.report);return await this.craft.render(input,radius,context.signal);}
          catch(error){if(context.signal?.aborted)throw error;if(!this.craftDisabled)this.report('PhotoCraft preview cannot run this operation within its bounds. Using the existing renderer.');this.craftDisabled=true;return fallback.apply(input,params,context);}
        }});else previewRegistry.register(fallback);
      }
    }
    const output=await renderStack(raster,renderDoc,previewRegistry,{signal:options.signal});
    if(this.disposed || generation!==this.generation)throw new DOMException('Render superseded','AbortError');
    return {canvas:rasterToCanvas(output),previewScale:proxy?sourceSize.scale:1,backend:'cpu',...(this.gpuFailure?{warning:this.gpuFailure}:{})};
  }
  dispose():void {this.disposed=true;this.generation++;this.gpu?.dispose();this.craft?.dispose();this.raster=undefined;this.proxy=undefined;}
}
