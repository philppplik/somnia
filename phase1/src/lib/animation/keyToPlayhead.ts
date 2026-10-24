import type {KeyRef} from './model';
import {snapToFrame} from './time';
/** Ticks to move the block so its earliest key lands on the playhead (frame-snapped). 0 when nothing would move. */
export function toPlayheadDelta(keys:readonly KeyRef[],playhead:number,fps:{num:number;den:number}):number{
 if(!keys.length||!Number.isFinite(playhead))return 0;
 const first=Math.min(...keys.map(k=>k.t));
 return snapToFrame(playhead,fps)-first;
}
