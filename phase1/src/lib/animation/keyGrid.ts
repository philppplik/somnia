import type {Composition,KeyRef} from './model';
import {frameToTick} from './time';
import {quantizeMoves} from './keyQuantize';
import type {Retime} from './keyQuantize';
export const MAX_GRID_FRAMES=240;
/** Move each key to the nearest multiple of `step` frames (counted from the composition start). Collisions are skipped, not merged. */
export function gridMoves(comp:Composition,keys:readonly KeyRef[],step:number):{moves:Retime[];skipped:number;unchanged:number}{
 if(!Number.isInteger(step)||step<2||step>MAX_GRID_FRAMES)throw Object.assign(new Error(`Use 2 to ${MAX_GRID_FRAMES} frames.`),{expected:true});
 const one=frameToTick(step,comp.fps),n=Math.floor(comp.duration/one),targets:number[]=[];
 for(let i=0;i<=n;i++)targets.push(comp.start+i*one);
 return quantizeMoves(comp,keys,targets);
}
