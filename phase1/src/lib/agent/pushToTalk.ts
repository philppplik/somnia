/** Pure prep only. Caps align existing VoiceInputSession. No timers or device I/O. */
export const PTT_LIMITS=Object.freeze({recordingMs:120000,audioBytes:20_000_000,transcribingMs:30000,transcriptChars:12000,transcriptBytes:48000});
export type PttState={phase:'idle'|'recording'|'transcribing'|'error';session:number;lastAt:number;startedAt:number;bytes:number;error:'timeout'|'too-large'|'capture'|'transcribe'|null};
export type PttEvent={type:'start'|'chunk'|'stop'|'tick'|'complete'|'fail'|'cancel'|'reset';at:number;session?:number;bytes?:number;transcript?:unknown};
export const initialPttState=():PttState=>Object.freeze({phase:'idle',session:0,lastAt:0,startedAt:0,bytes:0,error:null});
/** Escaped plain text only. No semantic instruction filtering or secret detection. */
export function sanitizeVoiceTranscript(value:unknown):{text:string;trust:'untrusted';reviewRequired:true;autoSend:false}{
 if(typeof value!=='string'||value.length>PTT_LIMITS.transcriptChars||new TextEncoder().encode(value).length>PTT_LIMITS.transcriptBytes||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069\uD800-\uDFFF]/u.test(value))throw Error('Invalid voice transcript');
 const text=value.replace(/\r\n?/g,'\n').trim();if(!text)throw Error('Empty voice transcript');
 return Object.freeze({text,trust:'untrusted',reviewRequired:true,autoSend:false});
}
export function transitionPtt(state:PttState,event:PttEvent):{state:PttState;transcript?:ReturnType<typeof sanitizeVoiceTranscript>}{
 if(!['idle','recording','transcribing','error'].includes(state.phase)||!Number.isSafeInteger(state.bytes)||state.bytes<0||state.bytes>PTT_LIMITS.audioBytes||!Number.isSafeInteger(state.startedAt)||state.startedAt<0||!Number.isSafeInteger(state.lastAt)||state.lastAt<state.startedAt)throw Error('Invalid voice state');
 if(!Number.isSafeInteger(event.at)||event.at<state.lastAt||!Number.isSafeInteger(state.session)||state.session<0)throw Error('Invalid voice clock/session');
 if(Object.keys(event).some(k=>!['type','at','session','bytes','transcript'].includes(k)))throw Error('Invalid voice event');
 if(event.type==='start'){
  if(state.phase!=='idle'||state.session===Number.MAX_SAFE_INTEGER)throw Error('Voice start overlaps active/error state');
  return {state:Object.freeze({phase:'recording',session:state.session+1,lastAt:event.at,startedAt:event.at,bytes:0,error:null})};
 }
 if(event.session!==state.session)throw Error('Stale voice session');
 const next=(patch:Partial<PttState>)=>({state:Object.freeze({...state,lastAt:event.at,...patch})});
 if(event.type==='reset'){if(state.phase!=='error')throw Error('Voice reset requires error');return next({phase:'idle',bytes:0,error:null});}
 if(event.type==='cancel')return next({phase:'idle',bytes:0,error:null});
 if(!['recording','transcribing'].includes(state.phase))throw Error('No active voice session');
 const limit=state.phase==='recording'?PTT_LIMITS.recordingMs:PTT_LIMITS.transcribingMs;
 if(event.at-state.startedAt>=limit)return next({phase:'error',error:'timeout'});
 if(event.type==='tick')return next({});
 if(event.type==='fail')return next({phase:'error',error:state.phase==='recording'?'capture':'transcribe'});
 if(event.type==='chunk'){
  if(state.phase!=='recording'||!Number.isSafeInteger(event.bytes)||(event.bytes as number)<0)throw Error('Invalid voice chunk');
  const bytes=state.bytes+event.bytes!;return next(bytes>PTT_LIMITS.audioBytes?{phase:'error',error:'too-large'}:{bytes});
 }
 if(event.type==='stop'){if(state.phase!=='recording'||state.bytes===0)throw Error('No recorded audio');return next({phase:'transcribing',startedAt:event.at});}
 if(event.type==='complete'){
  if(state.phase!=='transcribing')throw Error('Unexpected voice completion');
  try{return {...next({phase:'idle',bytes:0,error:null}),transcript:sanitizeVoiceTranscript(event.transcript)};}catch{return next({phase:'error',error:'transcribe'});}
 }
 throw Error('Unknown voice event');
}
