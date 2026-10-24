import type {Studio} from './types';
export function hasPartialStream(studio:Studio):boolean{return studio.messages.some(m=>m.role==='assistant_streaming'||m.role==='assistant_incomplete');}
/** Only native provisional records activate experimental UX. No timers fabricate output, steps or tokens. */
export function streamPresentation(studio:Studio){
 const partial=studio.messages.filter(m=>m.role==='assistant_streaming'||m.role==='assistant_incomplete').at(-1);
 if(!partial)return null;
 const active=['running','claimed','paused'].includes(studio.executionState)&&partial.role==='assistant_streaming';
 const tokens=studio.usage?.outputTokens;
 return {active,state:active?'live':studio.executionState==='stopped'?'stopped':['failed','crashed'].includes(studio.executionState)?'failed':'incomplete',text:partial.text,step:studio.lastStep,characters:Array.from(partial.text).length,reportedOutputTokens:typeof tokens==='number'&&Number.isSafeInteger(tokens)&&tokens>=0?tokens:null} as const;
}
