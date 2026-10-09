import type { PDFPageProxy } from 'pdfjs-dist';
import { bounds, decodePath, IDENTITY, multiply, pathBounds, point } from './geometry.ts';
import { PdfImportError, type ImportedPdf, type ImportedPdfPage, type Matrix, type PdfImportOptions, type Point } from './types.ts';
type PdfJs = typeof import('pdfjs-dist');
type ImageDataSource = { width: number; height: number; kind?: number; data?: Uint8Array | Uint8ClampedArray; bitmap?: CanvasImageSource; interpolate?: boolean };
interface State {
  matrix: Matrix; fill: string | null; stroke: string | null; lineWidth: number;
  dash: number[]; dashOffset: number; lineCap: number; lineJoin: number; miterLimit: number;
  fillOpacity: number; strokeOpacity: number;
}
const initialState = (): State => ({matrix:[...IDENTITY],fill:'#000000',stroke:'#000000',lineWidth:1,dash:[],dashOffset:0,lineCap:0,lineJoin:0,miterLimit:10,fillOpacity:1,strokeOpacity:1});
function abort(signal?: AbortSignal) { if(signal?.aborted)throw new PdfImportError('aborted','PDF import aborted.'); }
function positive(value: number, name: string, maximum=Number.MAX_SAFE_INTEGER): number {
  if(!Number.isFinite(value) || value<=0 || value>maximum)throw new PdfImportError('limit',`Invalid ${name}.`);
  return value;
}
function browserCanvas(width: number, height: number): HTMLCanvasElement {
  if(typeof document==='undefined')throw new PdfImportError('unavailable','A canvas factory is required outside a browser.');
  const c=document.createElement('canvas'); c.width=width; c.height=height; return c;
}
/** Additive, serializable read-only studio model. Original bytes remain owned by the caller. */
export async function importPdf(bytes: Uint8Array, options: PdfImportOptions = {}, importLibrary: () => Promise<PdfJs> = () => import('pdfjs-dist')): Promise<ImportedPdf> {
  abort(options.signal);
  const maxBytes=positive(options.maxBytes??25_000_000,'byte limit');
  const maxPages=positive(options.maxPages??2000,'page limit');
  positive(options.maxObjectsPerPage??100_000,'object limit');
  positive(options.maxImagePixels??16_000_000,'image pixel limit');
  positive(options.maxTotalImagePixels??64_000_000,'total image pixel limit');
  positive(options.thumbnailMaxSize??180,'thumbnail size',2048);
  if(bytes.byteLength>maxBytes)throw new PdfImportError('limit','PDF exceeds import byte limit.');
  if(!new TextDecoder().decode(bytes.subarray(0,1024)).includes('%PDF-'))throw new PdfImportError('invalid','Not a PDF file.');
  let lib: PdfJs;
  try { lib=await importLibrary(); } catch { abort(options.signal); throw new PdfImportError('unavailable','PDF.js could not be loaded.'); }
  abort(options.signal);
  if(options.workerSrc)lib.GlobalWorkerOptions.workerSrc=options.workerSrc;
  const task=lib.getDocument({data:bytes.slice(),password:options.password,stopAtErrors:true});
  const onAbort=()=>{ void task.destroy().catch(()=>{}); };
  options.signal?.addEventListener('abort',onAbort,{once:true});
  let totalImagePixels=0;
  try {
    const doc=await task.promise; abort(options.signal);
    if(doc.numPages>maxPages)throw new PdfImportError('limit','PDF exceeds import page limit.');
    const pages: ImportedPdfPage[]=[];
    for(let n=1;n<=doc.numPages;n++) {
      abort(options.signal);
      const page=await doc.getPage(n);
      try {
        pages.push(await extractPage(lib,page,options,pixels=>{
          if(totalImagePixels+pixels>(options.maxTotalImagePixels??64_000_000))return false;
          totalImagePixels+=pixels;return true;
        }));
        options.onProgress?.(n,doc.numPages);
      } finally { page.cleanup(); }
    }
    abort(options.signal);
    return {schemaVersion:1,pages,readOnly:true};
  } catch(e) {
    abort(options.signal);
    if(e instanceof PdfImportError)throw e;
    if(e instanceof Error && e.name==='PasswordException')throw new PdfImportError('password','A valid PDF password is required.');
    throw new PdfImportError('invalid',e instanceof Error?e.message:'PDF import failed.');
  } finally {
    options.signal?.removeEventListener('abort',onAbort);
    await task.destroy();
  }
}
async function extractPage(lib: PdfJs, page: PDFPageProxy, options: PdfImportOptions, reservePixels: (pixels:number)=>boolean): Promise<ImportedPdfPage> {
  const vp=page.getViewport({scale:1});
  const view=vp.transform as Matrix;
  const out: ImportedPdfPage={number:page.pageNumber,width:vp.width,height:vp.height,rotation:page.rotate,sourceBounds:[...page.view],viewportTransform:[...view],text:[],vectors:[],images:[],thumbnail:null,diagnostics:[]};
  const warn=(code:string,message:string,operatorIndex?:number)=>{
    if(!out.diagnostics.some(d=>d.code===code))out.diagnostics.push({code,message,...(operatorIndex===undefined?{}:{operatorIndex})});
  };
  const maxObjects=options.maxObjectsPerPage??100_000;
  const content=await page.getTextContent(); abort(options.signal);
  if(content.items.length>maxObjects)throw new PdfImportError('limit','Page exceeds import text object limit.');
  for(const item of content.items) {
    if(!('str' in item))continue;
    const transform=multiply(view,item.transform);
    const style=content.styles[item.fontName];
    const size=Math.hypot(transform[2],transform[3]);
    const ascent=style?.ascent??0.8, descent=style?.descent??-0.2;
    // Text width is already in PDF user-space units, unlike the normalized font transform.
    const baseline=Math.hypot(transform[0],transform[1])||1;
    const userScale=Math.hypot(view[0],view[1]);
    const right:Point=[transform[0]/baseline*item.width*userScale,transform[1]/baseline*item.width*userScale];
    const origin:Point=[transform[4],transform[5]];
    const quad:[Point,Point,Point,Point]=[
      [origin[0]+transform[2]*ascent,origin[1]+transform[3]*ascent],
      [origin[0]+right[0]+transform[2]*ascent,origin[1]+right[1]+transform[3]*ascent],
      [origin[0]+right[0]+transform[2]*descent,origin[1]+right[1]+transform[3]*descent],
      [origin[0]+transform[2]*descent,origin[1]+transform[3]*descent],
    ];
    out.text.push({id:`p${page.pageNumber}-text-${out.text.length}`,kind:'text',text:item.str,fontName:item.fontName,fontFamily:style?.fontFamily??'sans-serif',fontSize:size,direction:item.dir,hasEOL:item.hasEOL,transform,quad,bounds:bounds(quad)});
    if(style?.vertical)warn('vertical-text','Vertical text baseline is retained but its bounds are approximate.');
  }
  if(out.text.length)warn('text-appearance','Text extraction preserves content and baseline geometry, not paint colors, glyph outlines or exact font editing fidelity. Text order is reading order, not paint order.');
  let state=initialState(); const stack:State[]=[];
  const save=()=>stack.push({...state,matrix:[...state.matrix],dash:[...state.dash]});
  const restore=()=>{ state=stack.pop()??initialState(); };
  const op=await page.getOperatorList(); abort(options.signal);
  const ops=lib.OPS;
  const canvas=options.canvasFactory??browserCanvas;
  const checkCount=()=>{
    if(out.text.length+out.vectors.length+out.images.length>maxObjects)throw new PdfImportError('limit','Page exceeds import object limit.');
  };
  checkCount();
  const addImage=async (source:ImageDataSource,matrix:Matrix,index:number)=>{
    abort(options.signal);
    if(out.text.length+out.vectors.length+out.images.length>=maxObjects)throw new PdfImportError('limit','Page exceeds import object limit.');
    if(!source || !Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height) || source.width<=0 || source.height<=0) {warn('image-unavailable','An image could not be decoded.',index);return;}
    const pixels=source.width*source.height;
    if(pixels>(options.maxImagePixels??16_000_000) || !reservePixels(pixels)) {warn('image-limit','An image exceeds the retained pixel budget. Original thumbnail remains available.',index);return;}
    try {
      const c=canvas(source.width,source.height),ctx=c.getContext('2d');
      if(!ctx)throw Error('Canvas 2D unavailable.');
      if(source.bitmap)ctx.drawImage(source.bitmap,0,0);
      else if(source.data) {
        const image=ctx.createImageData(source.width,source.height),data=source.data;
        for(let p=0;p<pixels;p++) {
          let r:number,g:number,b:number,a=255;
          if(source.kind===lib.ImageKind.RGBA_32BPP){r=data[p*4];g=data[p*4+1];b=data[p*4+2];a=data[p*4+3];}
          else if(source.kind===lib.ImageKind.RGB_24BPP){r=data[p*3];g=data[p*3+1];b=data[p*3+2];}
          else if(source.kind===lib.ImageKind.GRAYSCALE_1BPP){const row=Math.floor(p/source.width),x=p%source.width;r=g=b=(data[row*Math.ceil(source.width/8)+(x>>3)]&(128>>(x%8)))?255:0;}
          else throw Error('Unsupported decoded image kind.');
          image.data.set([r,g,b,a],p*4);
        }
        ctx.putImageData(image,0,0);
      } else throw Error('Image pixels unavailable.');
      // PNG top-left pixels map into PDF's unit image square with an inverted Y axis.
      const transform=multiply(multiply(view,matrix),[1,0,0,-1,0,1]);
      const quad:[Point,Point,Point,Point]=[point(transform,0,0),point(transform,1,0),point(transform,1,1),point(transform,0,1)];
      out.images.push({id:`p${page.pageNumber}-image-${index}-${out.images.length}`,kind:'image',pixelWidth:source.width,pixelHeight:source.height,interpolate:source.interpolate??false,dataUrl:c.toDataURL('image/png'),transform,quad,bounds:bounds(quad)});
      c.width=1;c.height=1;
    } catch(e) {warn('image-unavailable',`An image could not be exported: ${e instanceof Error?e.message:'unknown error'}`,index);}
  };
  const getImage=(id:string):Promise<ImageDataSource>=>new Promise((resolve,reject)=>{
    const store=id.startsWith('g_')?page.commonObjs:page.objs;
    const timeout=setTimeout(()=>finish(new Error('Image decode timed out.')),10_000);
    const onAbort=()=>finish(new PdfImportError('aborted','PDF import aborted.'));
    const finish=(error?:Error,value?:ImageDataSource)=>{clearTimeout(timeout);options.signal?.removeEventListener('abort',onAbort);if(error)reject(error);else resolve(value!);};
    options.signal?.addEventListener('abort',onAbort,{once:true});
    if(options.signal?.aborted){onAbort();return;}
    try{store.get(id,(value:ImageDataSource)=>finish(undefined,value));}catch(e){finish(e instanceof Error?e:new Error('Image lookup failed.'));}
  });
  for(let i=0;i<op.fnArray.length;i++) {
    abort(options.signal);checkCount();
    const fn=op.fnArray[i],args=op.argsArray[i] as any[];
    if(fn===ops.save)save();
    else if(fn===ops.restore)restore();
    else if(fn===ops.transform)state.matrix=multiply(state.matrix,args);
    else if(fn===ops.paintFormXObjectBegin){save();if(args[0])state.matrix=multiply(state.matrix,args[0]);if(args[1])warn('clipping','Imported geometry is not clipped. Original page rendering preserves clipping.',i);}
    else if(fn===ops.paintFormXObjectEnd)restore();
    else if(fn===ops.beginGroup){save();warn('group-compositing','Transparency/group compositing is not represented in extracted objects.',i);}
    else if(fn===ops.endGroup)restore();
    else if(fn===ops.setFillRGBColor)state.fill=args[0];
    else if(fn===ops.setStrokeRGBColor)state.stroke=args[0];
    else if(fn===ops.setFillTransparent)state.fill='transparent';
    else if(fn===ops.setStrokeTransparent)state.stroke='transparent';
    else if(fn===ops.setLineWidth)state.lineWidth=args[0];
    else if(fn===ops.setDash){state.dash=Array.from(args[0]);state.dashOffset=args[1];}
    else if(fn===ops.setLineCap)state.lineCap=args[0];
    else if(fn===ops.setLineJoin)state.lineJoin=args[0];
    else if(fn===ops.setMiterLimit)state.miterLimit=args[0];
    else if(fn===ops.setGState)for(const [key,value] of args[0]) {
      if(key==='ca')state.fillOpacity=value;
      else if(key==='CA')state.strokeOpacity=value;
      else if(key==='LW')state.lineWidth=value;
      else if(key==='LC')state.lineCap=value;
      else if(key==='LJ')state.lineJoin=value;
      else if(key==='ML')state.miterLimit=value;
      else if(key==='D'){state.dash=Array.from(value[0]);state.dashOffset=value[1];}
      else if(key==='SMask'||key==='BM')warn('compositing','Soft masks and blend modes are not represented in extracted objects.',i);
    }
    else if(fn===ops.constructPath) {
      const paintOp=args[0],packed=args[1]?.[0];
      if(paintOp===ops.endPath)continue;
      if(!packed || typeof packed.length!=='number'){warn('path-unavailable','A path could not be decoded.',i);continue;}
      try {
        if(packed.length>1_000_000)throw new PdfImportError('limit','Path exceeds geometry limit.');
        const matrix=multiply(view,state.matrix),commands=decodePath(packed,matrix);
        const fill=[ops.fill,ops.eoFill,ops.fillStroke,ops.eoFillStroke,ops.closeFillStroke,ops.closeEOFillStroke].includes(paintOp);
        const stroke=[ops.stroke,ops.closeStroke,ops.fillStroke,ops.eoFillStroke,ops.closeFillStroke,ops.closeEOFillStroke].includes(paintOp);
        if(!fill&&!stroke){warn('path-paint','Unsupported path paint operation.',i);continue;}
        out.vectors.push({id:`p${page.pageNumber}-vector-${i}`,kind:'vector',commands,bounds:pathBounds(commands),paint:fill?(stroke?'fill-stroke':'fill'):'stroke',fillRule:[ops.eoFill,ops.eoFillStroke,ops.closeEOFillStroke].includes(paintOp)?'evenodd':'nonzero',fill:fill?state.fill:null,stroke:stroke?state.stroke:null,lineWidth:state.lineWidth*Math.sqrt(Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2])),sourceTransform:matrix,sourceLineWidth:state.lineWidth,dash:[...state.dash],dashOffset:state.dashOffset,lineCap:state.lineCap,lineJoin:state.lineJoin,miterLimit:state.miterLimit,fillOpacity:state.fillOpacity,strokeOpacity:state.strokeOpacity});
      } catch(e) {if(e instanceof PdfImportError)throw e;warn('path-unavailable','A path uses unsupported geometry.',i);}
    }
    else if(fn===ops.paintImageXObject || fn===ops.paintInlineImageXObject) {
      try {await addImage(fn===ops.paintImageXObject?await getImage(args[0]):args[0],state.matrix,i);}
      catch(e){abort(options.signal);if(e instanceof PdfImportError)throw e;warn('image-unavailable',e instanceof Error?e.message:'Image unavailable.',i);}
    }
    else if(fn===ops.paintImageXObjectRepeat) {
      try{const image=await getImage(args[0]);for(let p=0;p<args[3].length;p+=2)await addImage(image,multiply(state.matrix,[args[1],0,0,args[2],args[3][p],args[3][p+1]]),i);}
      catch(e){abort(options.signal);if(e instanceof PdfImportError)throw e;warn('image-unavailable',e instanceof Error?e.message:'Image unavailable.',i);}
    }
    else if(fn===ops.paintInlineImageXObjectGroup)warn('image-group','Optimized atlas images are not separated. Original thumbnail remains available.',i);
    else if([ops.paintImageMaskXObject,ops.paintImageMaskXObjectGroup,ops.paintImageMaskXObjectRepeat,ops.paintSolidColorImageMask].includes(fn))warn('image-mask','Stencil image masks are not extracted as standalone images.',i);
    else if(fn===ops.clip||fn===ops.eoClip)warn('clipping','Imported geometry is not clipped. Original page rendering preserves clipping.',i);
    else if([ops.setFillColorN,ops.setStrokeColorN,ops.shadingFill].includes(fn)) {
      if(fn===ops.setFillColorN)state.fill=null;
      if(fn===ops.setStrokeColorN)state.stroke=null;
      warn('pattern-shading','Patterns and shadings require original page rendering.',i);
    }
    else if([ops.beginMarkedContent,ops.beginMarkedContentProps].includes(fn))warn('optional-content','Layer visibility/marked-content semantics are not represented in extracted objects.',i);
  }
  checkCount();
  if(options.thumbnails!==false) {
    abort(options.signal);
    const scale=(options.thumbnailMaxSize??180)/Math.max(vp.width,vp.height);
    const tvp=page.getViewport({scale});
    let c: HTMLCanvasElement;
    try{c=canvas(Math.max(1,Math.ceil(tvp.width)),Math.max(1,Math.ceil(tvp.height)));}
    catch(e){warn('thumbnail-unavailable',e instanceof Error?e.message:'Canvas unavailable.');return out;}
    const render=page.render({canvas:c,viewport:tvp,background:'#ffffff'});
    const onAbort=()=>render.cancel();options.signal?.addEventListener('abort',onAbort,{once:true});
    try {await render.promise;abort(options.signal);out.thumbnail={dataUrl:c.toDataURL('image/png'),width:c.width,height:c.height};}
    catch(e){abort(options.signal);warn('thumbnail-unavailable',e instanceof Error?e.message:'Thumbnail could not be rendered.');}
    finally{options.signal?.removeEventListener('abort',onAbort);c.width=1;c.height=1;}
  }
  return out;
}
