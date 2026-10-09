import {useEffect,useRef} from 'react';
/**
 * Clock for playing through a title card, which has no <video> element to drive time.
 * While `running`, calls `onTime` every animation frame with the timeline time (from `from`, in seconds) and `onEnd` once it reaches `limit`.
 */
export function useTitlePlayback({running,from,limit,onTime,onEnd}:{running:boolean;from:number;limit:number;onTime:(t:number)=>void;onEnd:()=>void}){
 const cb=useRef({onTime,onEnd,from});cb.current={onTime,onEnd,from};
 useEffect(()=>{
  if(!running)return;
  const t0=performance.now(),base=cb.current.from;let raf=0;
  const tick=(now:number)=>{
   const t=base+(now-t0)/1000;
   if(t>=limit){cb.current.onTime(limit);cb.current.onEnd();return;}
   cb.current.onTime(t);raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(raf);
 },[running,limit]);
}
