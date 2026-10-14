import type {InterfaceAsset} from '../interface/schema';
import type {Composition} from './model';
import {checkExportable,exportSlug,frameSvg,ExportError} from './exportFrames';
import {tickToFrame} from './time';
export const MAX_SVG_BYTES=16*1024*1024;
export const frameSvgFileName=(name:string,frameNumber:number)=>`${exportSlug(name)}_${String(frameNumber).padStart(5,'0')}.svg`;
/** One frame as a standalone SVG file (vector, drawing size of the composition). Fonts are referenced by name, not embedded. */
export function exportFrameSvg(comp:Composition,tick:number,name:string,transparent=false,assets:readonly InterfaceAsset[]=[]):{blob:Blob;fileName:string}{
 checkExportable(comp,1);
 const svg=frameSvg(comp,tick,transparent,assets);
 if(svg.length>MAX_SVG_BYTES)throw new ExportError('The frame is too large for one SVG file.','too-large');
 return {blob:new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`],{type:'image/svg+xml'}),fileName:frameSvgFileName(name,tickToFrame(tick,comp.fps)-tickToFrame(comp.start,comp.fps))};
}
