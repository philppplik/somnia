import {frameToTick,tickToFrame,type Rational} from './time';
/** Frame range [first,last] (inclusive) covered by a work area. The out point is exclusive, so the last frame is the one before it. */
export function workAreaFrames(area:{in:number;out:number},fps:Rational){
 const first=tickToFrame(area.in,fps);const endExclusive=Math.max(first+1,tickToFrame(area.out,fps));
 return {first,last:endExclusive-1,count:endExclusive-first};
}
/**
 * Playhead tick after `elapsedMs` of playback that began at `startTick`. Playback stays inside the work area.
 * Starting outside it, or on its last frame without looping, jumps to its first frame. Looping wraps; otherwise it holds the last frame and reports `ended`.
 */
export function playbackAt(startTick:number,elapsedMs:number,area:{in:number;out:number},fps:Rational,loop:boolean):{tick:number;ended:boolean}{
 const {first,last,count}=workAreaFrames(area,fps);
 let from=tickToFrame(startTick,fps);if(from<first||from>last||(!loop&&from===last))from=first;
 const advanced=Math.max(0,Math.floor(elapsedMs/1000*fps.num/fps.den));
 if(loop)return {tick:frameToTick(first+((from-first+advanced)%count),fps),ended:false};
 const f=from+advanced;return f>=last?{tick:frameToTick(last,fps),ended:true}:{tick:frameToTick(f,fps),ended:false};
}
