import type {AgentEvent} from './core';

/** Provider-neutral UI sink. Preserve event order, but render text at most once per
 * frame-sized interval. Timers also drain in background WebViews where RAF pauses. */
export function createStreamSink(emit:(event:AgentEvent)=>void,delayMs=24){
 let text='',closed=false,timer:ReturnType<typeof setTimeout>|undefined;
 const flush=()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined;if(text){const delta=text;text='';emit({type:'text-delta',text:delta});}};
 return {
  receive(event:AgentEvent){
   if(closed)return;
   if(event.type==='text-delta'){
    if(!event.text)return;
    text+=event.text;
    if(timer===undefined)timer=setTimeout(flush,delayMs);
    return;
   }
   flush();
   if(event.type==='done'||event.type==='error')closed=true;
   emit(event);
  },
  /** Stop keeps already received text; replacement/unmount discards queued text. */
  close(keepText=false){closed=true;if(keepText)flush();else {text='';if(timer!==undefined)clearTimeout(timer);timer=undefined;}}
 };
}
