import {zipSync} from 'fflate';

/** Longest side of an exported slide image in pixels, the most slides, and the most image bytes one export may hold in memory. */
export const EXPORT_MAX_PX=1920;
export const EXPORT_MAX_SLIDES=200;
export const EXPORT_MAX_BYTES=200*1024*1024;
const PNG_SIGNATURE=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];

/** Render scale (pixels per point) that puts the longer side at EXPORT_MAX_PX. Never enlarges past what the size allows. */
export function exportScale(widthPt:number,heightPt:number):number{
  if(!Number.isFinite(widthPt)||!Number.isFinite(heightPt)||widthPt<=0||heightPt<=0)throw Error('Slide size is not readable');
  return EXPORT_MAX_PX/Math.max(widthPt,heightPt);
}
/** `slide-01.png`, `slide-02.png`, ... padded to the width of the slide count (at least two digits). */
export function exportEntryName(index:number,count:number):string{
  if(!Number.isInteger(index)||!Number.isInteger(count)||index<0||index>=count)throw Error('Slide index out of range');
  return `slide-${String(index+1).padStart(Math.max(2,String(count).length),'0')}.png`;
}
/** A safe archive name from the presentation name: `<name>-png.zip`. */
export function exportZipName(name:string):string{
  const base=name.replace(/^.*[\\/]/,'').replace(/\.pptx$/i,'').replace(/[^\p{L}\p{N}._-]+/gu,'_').replace(/^[._]+|[._]+$/g,'').slice(0,80);
  return `${base||'slides'}-png.zip`;
}
/** One PNG per slide, in slide order. Images are already compressed, so the archive stores them as they are. */
export function buildPngZip(pngs:readonly Uint8Array[]):Uint8Array{
  if(!pngs.length)throw Error('There are no slides to export');
  if(pngs.length>EXPORT_MAX_SLIDES)throw Error(`At most ${EXPORT_MAX_SLIDES} slides can be exported at once`);
  let total=0;const entries:Record<string,Uint8Array>={};
  pngs.forEach((png,i)=>{
    if(png.length<PNG_SIGNATURE.length||PNG_SIGNATURE.some((b,k)=>png[k]!==b))throw Error(`Slide ${i+1} did not render as a PNG image`);
    total+=png.length;if(total>EXPORT_MAX_BYTES)throw Error('The slide images are too large to export at once');
    entries[exportEntryName(i,pngs.length)]=png;
  });
  return zipSync(entries,{level:0});
}
