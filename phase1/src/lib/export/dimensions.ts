/** Shared export dimension math: percent or exact sizing with optional aspect lock, clamped to safe raster bounds. */
export interface ExportDimensionInput{sourceWidth:number;sourceHeight:number;mode:'percent'|'exact';percent:number;width:number;height:number;lockAspect:boolean}
export const EXPORT_MAX_PIXELS=16_777_216,EXPORT_MAX_EDGE=16384;
/** Resolves target pixel dimensions. Throws on non-finite or sub-1 results so callers validate before rendering. */
export function exportDimensions(input:ExportDimensionInput):{width:number;height:number}{
 const {sourceWidth:w,sourceHeight:h}=input;
 if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1)throw Error('Invalid source dimensions.');
 let width:number,height:number;
 if(input.mode==='percent'){
  if(!Number.isFinite(input.percent)||input.percent<1||input.percent>800)throw Error('Scale must be 1..800%.');
  width=Math.round(w*input.percent/100);height=Math.round(h*input.percent/100);
 }else{
  width=Math.round(input.width);height=Math.round(input.height);
  if(input.lockAspect){
   if(Number.isFinite(width)&&width>=1&&(!Number.isFinite(height)||height<1))height=Math.round(width*h/w);
   else if(Number.isFinite(height)&&height>=1&&(!Number.isFinite(width)||width<1))width=Math.round(height*w/h);
   else if(Number.isFinite(width)&&Number.isFinite(height)&&width>=1&&height>=1){/* explicit pair honoured */}
   else throw Error('Set width or height.');
  }
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw Error('Dimensions must be at least 1px.');
 }
 if(width>EXPORT_MAX_EDGE||height>EXPORT_MAX_EDGE||width*height>EXPORT_MAX_PIXELS)throw Error('Export exceeds the 16 MP raster limit.');
 return{width,height};
}
/** Complements one side from the other under a locked aspect ratio; used to fill the paired field live. */
export function aspectComplement(source:{width:number;height:number},side:'width'|'height',value:number):number{
 const ratio=side==='width'?source.height/source.width:source.width/source.height;
 return Math.max(1,Math.round(value*ratio));
}
