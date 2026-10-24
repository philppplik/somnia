/** JKL-style shuttle state for preview playback: a rate multiplier ladder on top of the per-clip speed. */
export const SHUTTLE_RATES=[1,1.5,2,4] as const;
export type ShuttleState={rate:number;playing:boolean};
const clampRate=(r:number)=>SHUTTLE_RATES.some(x=>x===r)?r:1;
/** L key: paused -> play at 1x; playing -> next rate up (capped at the top of the ladder). */
export function shuttleFaster(s:ShuttleState):ShuttleState{
 if(!s.playing)return{rate:1,playing:true};
 const i=SHUTTLE_RATES.indexOf(clampRate(s.rate) as 1);
 return{rate:SHUTTLE_RATES[Math.min(SHUTTLE_RATES.length-1,i+1)],playing:true};
}
/** J key while playing: step the rate down; at 1x it pauses. Backward playback is not possible with <video> elements, so paused J is handled by the caller as a frame step back. */
export function shuttleSlower(s:ShuttleState):ShuttleState{
 if(!s.playing)return{rate:clampRate(s.rate),playing:false};
 const i=SHUTTLE_RATES.indexOf(clampRate(s.rate) as 1);
 if(i<=0)return{rate:1,playing:false};
 return{rate:SHUTTLE_RATES[i-1],playing:true};
}
