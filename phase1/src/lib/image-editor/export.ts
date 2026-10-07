import type { ImageEditDocument, ExportOptions } from './types';
import type { ImageEditorRenderer } from './renderer';
export function exportSettings(options: ExportOptions): {mime:string;extension:string;quality:number} {
  const formats={png:['image/png','png'],jpg:['image/jpeg','jpg'],webp:['image/webp','webp']} as const;
  const format=formats[options.format];if(!format)throw new Error('Unsupported export format.');
  const quality=options.quality ?? 0.92;
  if(!Number.isFinite(quality)||quality<0||quality>1)throw new RangeError('Export quality must be between 0 and 1.');
  return {mime:format[0],extension:format[1],quality};
}
export async function exportImage(renderer: ImageEditorRenderer, doc: ImageEditDocument, options: ExportOptions, signal?:AbortSignal): Promise<Blob> {
  const {mime,quality}=exportSettings(options);signal?.throwIfAborted();
  const result=await renderer.render(doc,{signal,preview:false});
  let canvas=result.canvas;
  if(options.format==='jpg' || options.background) {
    const flat=document.createElement('canvas');flat.width=canvas.width;flat.height=canvas.height;
    const context=flat.getContext('2d');if(!context)throw new Error('Canvas2D is unavailable.');
    const background=options.background ?? '#ffffff';
    if(!CSS.supports('color',background))throw new Error('Invalid export background colour.');
    context.fillStyle=background;context.fillRect(0,0,flat.width,flat.height);context.drawImage(canvas,0,0);canvas=flat;
  }
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Image encoding failed.')),mime,quality));
  signal?.throwIfAborted();
  // WKWebView can silently encode PNG for unsupported WebP. Never save it under a .webp suffix.
  if(blob.type!==mime)throw new Error(`This webview cannot export ${options.format.toUpperCase()}. Use PNG instead.`);
  return blob;
}
export function downloadImage(blob: Blob, name: string): void {
  const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
