import {zlibSync,strToU8} from 'fflate';
import {crc32} from './apngEncode';
/** Sprite sheet: frames packed into one PNG grid plus an atlas JSON. Pure planner, packer and PNG writer; the app supplies the pixels. */
export const SHEET_MAX_FRAMES=256,SHEET_MAX_PIXELS=4096*4096,SHEET_MAX_SIDE=16384;
export class SheetError extends Error{constructor(message:string,readonly code:'too-many'|'too-large'|'empty'){super(message);this.name='SheetError';}}
export interface SheetCell{index:number;x:number;y:number}
export interface SheetPlan{columns:number;rows:number;width:number;height:number;cellW:number;cellH:number;cells:SheetCell[]}
/** Grid of count cells. `columns` defaults to the smallest near-square grid. Throws SheetError past the frame and pixel limits. */
export function sheetPlan(count:number,cellW:number,cellH:number,columns?:number):SheetPlan{
 if(!Number.isInteger(count)||count<1)throw new SheetError('The work area has no frames.','empty');
 if(count>SHEET_MAX_FRAMES)throw new SheetError(`A sprite sheet is limited to ${SHEET_MAX_FRAMES} frames. Shorten the work area.`,'too-many');
 if(!Number.isInteger(cellW)||!Number.isInteger(cellH)||cellW<1||cellH<1)throw new SheetError('Invalid frame size.','too-large');
 const cols=Math.min(count,Math.max(1,Math.round(columns??Math.ceil(Math.sqrt(count)))));
 const rows=Math.ceil(count/cols),width=cols*cellW,height=rows*cellH;
 if(width>SHEET_MAX_SIDE||height>SHEET_MAX_SIDE||width*height>SHEET_MAX_PIXELS)throw new SheetError(`The sheet would be ${width}x${height} pixels, above the limit of ${SHEET_MAX_PIXELS/1048576} megapixels. Lower the scale or shorten the work area.`,'too-large');
 return {columns:cols,rows,width,height,cellW,cellH,cells:Array.from({length:count},(_,i)=>({index:i,x:(i%cols)*cellW,y:Math.floor(i/cols)*cellH}))};
}
/** Copies each frame (RGBA, cellW x cellH) into its cell of one RGBA buffer. */
export function packSheet(plan:SheetPlan,frames:readonly Uint8ClampedArray[]):Uint8ClampedArray{
 if(frames.length!==plan.cells.length)throw new Error('Frame count does not match the plan.');
 const out=new Uint8ClampedArray(plan.width*plan.height*4),rowBytes=plan.cellW*4;
 frames.forEach((f,i)=>{
  if(f.length!==plan.cellW*plan.cellH*4)throw new Error('Frame pixels do not match the cell size.');
  const c=plan.cells[i];
  for(let y=0;y<plan.cellH;y++)out.set(f.subarray(y*rowBytes,(y+1)*rowBytes),((c.y+y)*plan.width+c.x)*4);
 });
 return out;
}
const u32=(n:number)=>new Uint8Array([n>>>24,(n>>>16)&255,(n>>>8)&255,n&255]);
function chunk(type:string,data:Uint8Array):Uint8Array{
 const body=new Uint8Array(4+data.length);body.set(strToU8(type));body.set(data,4);
 const out=new Uint8Array(12+data.length);out.set(u32(data.length));out.set(body,4);out.set(u32(crc32(body)),8+data.length);return out;
}
/** 8-bit RGBA PNG (filter 0, one IDAT). */
export function encodePngRgba(width:number,height:number,rgba:Uint8ClampedArray):Uint8Array{
 if(rgba.length!==width*height*4)throw new Error('Pixel buffer does not match the size.');
 const raw=new Uint8Array(height*(width*4+1));
 for(let y=0;y<height;y++){raw[y*(width*4+1)]=0;raw.set(rgba.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);}
 const ihdr=new Uint8Array(13);ihdr.set(u32(width));ihdr.set(u32(height),4);ihdr[8]=8;ihdr[9]=6;
 const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlibSync(raw,{level:6})),chunk('IEND',new Uint8Array(0))];
 const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;
}
export function sheetManifest(plan:SheetPlan,frames:readonly {frame:number;tick:number}[],name:string,sheetFile:string,fps:{num:number;den:number}){
 return {format:'somnia-animation-sprite-sheet',version:1,image:sheetFile,composition:name,width:plan.width,height:plan.height,frameWidth:plan.cellW,frameHeight:plan.cellH,columns:plan.columns,rows:plan.rows,frameRate:{num:fps.num,den:fps.den},
  frames:plan.cells.map((c,i)=>({frame:frames[i].frame,tick:frames[i].tick,x:c.x,y:c.y,w:plan.cellW,h:plan.cellH}))};
}
