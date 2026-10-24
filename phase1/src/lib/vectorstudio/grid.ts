import type {Point} from '../vectorio';
/** Document grid: view state only (not saved in the SVG, no undo step). */
export const GRID_LIMITS=Object.freeze({min:1,max:1000});
export interface GridOptions{show:boolean;snap:boolean;size:number}
export const DEFAULT_GRID:GridOptions=Object.freeze({show:false,snap:false,size:10});
/** Validates a partial grid setting; throws RangeError on anything unusable. */
export function checkGrid(o:Partial<GridOptions>):Partial<GridOptions>{
 const out:Partial<GridOptions>={};
 for(const k of ['show','snap'] as const){const v=o[k];if(v===undefined)continue;if(typeof v!=='boolean')throw new RangeError(`${k} must be true or false`);out[k]=v;}
 if(o.size!==undefined){if(typeof o.size!=='number'||!Number.isFinite(o.size)||o.size<GRID_LIMITS.min||o.size>GRID_LIMITS.max)throw new RangeError(`size must be ${GRID_LIMITS.min} to ${GRID_LIMITS.max}`);out.size=o.size;}
 return out;
}
const r3=(v:number)=>Math.round(v*1000)/1000;
export const snapValue=(v:number,size:number)=>Number.isFinite(v)&&size>0?r3(Math.round(v/size)*size):v;
export const snapPointToGrid=(p:Point,size:number):Point=>({x:snapValue(p.x,size),y:snapValue(p.y,size)});
/** Movement (dx, dy) adjusted so the box's top-left corner lands on a grid line. */
export function gridDelta(box:{minX:number;minY:number},dx:number,dy:number,size:number):{dx:number;dy:number}{
 return {dx:snapValue(box.minX+dx,size)-box.minX,dy:snapValue(box.minY+dy,size)-box.minY};
}
/** The grid is only drawn when its lines are at least 4 screen pixels apart (otherwise it would be a grey wash). */
export const gridVisible=(g:GridOptions,zoom:number)=>g.show&&g.size*zoom>=4;
