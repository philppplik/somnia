import { renderStack, type OperationRegistry, type RasterImage } from './pipeline';
import type { LoadedImage } from './loader';
import type { ImageEditDocument } from './types';
import { ImageGpuRenderer } from './webgl';
export interface RenderResult { canvas: HTMLCanvasElement; backend: 'cpu' | 'webgl2'; warning?: string }
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
/** Cache one decoded base, never base64 or per-frame getImageData. Export always evaluates the CPU reference. */
export class ImageEditorRenderer {
  private raster?: RasterImage;
  private gpu?: ImageGpuRenderer;
  private gpuFailure?: string;
  private generation=0;
  private disposed=false;
  constructor(readonly source: LoadedImage, readonly registry: OperationRegistry) {}
  async render(doc: ImageEditDocument, options: {signal?:AbortSignal;preview?:boolean} = {}): Promise<RenderResult> {
    if(this.disposed)throw new Error('Image renderer has been disposed.');
    if(doc.source.id!==this.source.document.source.id)throw new Error('Wrong source for this renderer.');
    const generation=++this.generation;options.signal?.throwIfAborted();
    const active=doc.operations.filter(op=>op.enabled);
    // Unedited image needs no readback, even at 64 MP.
    if(active.length===0) {
      const canvas=document.createElement('canvas');canvas.width=doc.source.width;canvas.height=doc.source.height;
      canvasContext(canvas).drawImage(this.source.bitmap,0,0);return {canvas,backend:'cpu'};
    }
    this.raster ||= decodeRaster(this.source);
    if(options.preview && active.every(op=>!!this.registry.get(op).fragmentShader)) {
      try {
        if(!this.gpu)this.gpu=new ImageGpuRenderer(document.createElement('canvas'));
        const fragments=active.map(op=>this.registry.get(op).fragmentShader!(op.params));
        return {canvas:this.gpu.render(this.raster,fragments),backend:'webgl2'};
      } catch(error) { this.gpuFailure=error instanceof Error?error.message:String(error); }
    }
    const raster=await renderStack(this.raster,doc,this.registry,{signal:options.signal});
    if(this.disposed || generation!==this.generation)throw new DOMException('Render superseded','AbortError');
    return {canvas:rasterToCanvas(raster),backend:'cpu',...(this.gpuFailure?{warning:this.gpuFailure}:{})};
  }
  dispose():void {this.disposed=true;this.generation++;this.gpu?.dispose();this.raster=undefined;}
}
