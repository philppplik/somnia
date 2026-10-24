export interface RehearsalState{slide:number;running:boolean;started:number|null;times:Readonly<Record<number,number>>}
export const newRehearsal=(slide:number):RehearsalState=>({slide,running:false,started:null,times:{}});
const valid=(n:number)=>Number.isFinite(n)&&n>=0;
/** Monotonic milliseconds, no wall-clock claims or automatic slide advancement. */
export function rehearsalStep(state:RehearsalState,action:'start'|'pause'|'slide'|'reset',now:number,slide=state.slide):RehearsalState{
 if(!valid(now)||!Number.isSafeInteger(slide)||slide<0||slide>=10000)throw Error('Invalid rehearsal clock/slide');
 if(action==='reset')return newRehearsal(slide);
 const times={...state.times};if(state.running&&state.started!==null){if(now<state.started)throw Error('Clock moved backward');times[state.slide]=Math.min(86400000,(times[state.slide]??0)+now-state.started);}
 const running=action==='start'||(action==='slide'&&state.running);return {slide,running,started:running?now:null,times:Object.freeze(times)};
}
export function rehearsalTimes(state:RehearsalState,now:number){if(!valid(now))throw Error('Invalid rehearsal clock');const times={...state.times};if(state.running&&state.started!==null)times[state.slide]=Math.min(86400000,(times[state.slide]??0)+Math.max(0,now-state.started));return times;}
export function rehearsalClock(ms:number){const s=Math.floor(Math.max(0,ms)/1000);return Math.floor(s/60).toString().padStart(2,'0')+':'+(s%60).toString().padStart(2,'0');}
