/** Playback of the animation clips of an imported glTF. Pure time logic, no three.js. Clips are played, never edited. */
export interface ClipInfo{name:string;duration:number}
export interface AnimState{clip:number;playing:boolean;time:number;loop:boolean;speed:number}
export const SPEEDS=[0.25,0.5,1,2] as const;
export const MAX_SPEED=4;
export const initialAnim=():AnimState=>({clip:0,playing:false,time:0,loop:true,speed:1});
export class AnimationError extends Error{constructor(m:string){super(m);this.name='AnimationError';}}
export const clampTime=(t:number,duration:number):number=>!Number.isFinite(t)||duration<=0?0:Math.min(Math.max(t,0),duration);
export function checkClip(index:unknown,clips:readonly ClipInfo[]):number{
 if(!clips.length)throw new AnimationError('This scene has no animation clips.');
 if(typeof index!=='number'||!Number.isInteger(index)||index<0||index>=clips.length)throw new AnimationError(`Clip must be a whole number from 0 to ${clips.length-1}.`);
 return index;
}
export function checkSpeed(speed:unknown):number{
 if(typeof speed!=='number'||!Number.isFinite(speed)||speed<=0||speed>MAX_SPEED)throw new AnimationError(`Speed must be above 0 and at most ${MAX_SPEED}.`);return speed;
}
/** Moves time forward by dt seconds. Looping wraps, otherwise playback stops at the end. */
export function advance(time:number,dt:number,duration:number,loop:boolean,speed:number):{time:number;ended:boolean}{
 if(duration<=0)return{time:0,ended:true};
 const next=time+Math.max(0,dt)*speed;
 if(next<duration)return{time:Math.max(0,next),ended:false};
 if(loop)return{time:next%duration,ended:false};
 return{time:duration,ended:true};
}
/** Starting play at the end of a clip that does not loop restarts it from the beginning. */
export const startTime=(time:number,duration:number,loop:boolean):number=>!loop&&time>=duration?0:time;
export function formatClock(seconds:number):string{
 const s=Math.max(0,Number.isFinite(seconds)?seconds:0);const m=Math.floor(s/60);const rest=s-m*60;
 return `${m}:${rest.toFixed(2).padStart(5,'0')}`;
}
