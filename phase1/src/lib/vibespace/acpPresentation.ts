/** ACP client presentation (Welle-B A2): consent origin and transcript lines for external
 * agents. Pure mapping of native data (the Rust `Origin::ExternalAgent` wire form and the
 * `vibespace-acp` JSONL event log) to i18n keys. No consent decision is made here. */

export interface AcpLine{key:string;params:Record<string,string>;tone:'info'|'allowed'|'denied'|'warn'}

/** Wire origin from the native consent payload (`{type:'external_agent',name}`). */
export function describeConsentOrigin(origin:{type?:string;name?:string}|null|undefined):AcpLine|null{
 if(!origin||origin.type!=='external_agent')return null;
 return{key:'vibespace.acp.origin',params:{name:cleanText(origin.name,80)},tone:'info'};
}

/** One event of the persistent ACP event log (`{seq,ts,kind,data}`). Unknown kinds (raw agent
 * updates, prompts) are not transcript lines of their own and return null. */
export function describeAcpEvent(ev:{kind?:string;data?:Record<string,unknown>}|null|undefined):AcpLine|null{
 if(!ev||typeof ev.kind!=='string')return null;
 const d=(ev.data??{}) as Record<string,unknown>;
 if(ev.kind==='computer_use'){
  const decision=d.decision;
  const phase=d.phase;
  return{key:decision==='allowed'?'vibespace.computerUse.allowed':decision==='denied'?'vibespace.computerUse.denied':'vibespace.computerUse.pending',params:{agent:cleanText(d.agent,80),action:cleanText(phase,40)},tone:decision==='allowed'?'allowed':decision==='denied'?'denied':'warn'};
 }
 if(ev.kind==='permission'){
  const dec=d.decision;
  const key=dec==='allowed'?'vibespace.acp.perm.allowed':dec==='denied'?'vibespace.acp.perm.denied':'vibespace.acp.perm.cancelled';
  // Anything but an explicit "allowed" is shown as not allowed.
  const tone=dec==='allowed'?'allowed':dec==='denied'?'denied':'warn';
  return{key,params:{kind:cleanText(d.kind,20),title:cleanText(d.title,120)},tone};
 }
 if(ev.kind==='session_ready')return{key:d.resumed===true?'vibespace.acp.sessionResumed':'vibespace.acp.sessionNew',params:{},tone:'info'};
 if(ev.kind==='lifecycle'){
  switch(d.event){
   case'launched':return{key:'vibespace.acp.launched',params:{},tone:'info'};
   case'initialized':return{key:'vibespace.acp.initialized',params:{},tone:'info'};
   case'cancel_requested':return{key:'vibespace.acp.cancel',params:{},tone:'warn'};
   case'killed':return{key:'vibespace.acp.killed',params:{},tone:'warn'};
   case'stream_closed':return{key:'vibespace.acp.closed',params:{},tone:'warn'};
  }
 }
 return null;
}

/** Transcript lines for a whole event log, in order. */
export function describeAcpTranscript(events:readonly {kind?:string;data?:Record<string,unknown>}[]):AcpLine[]{
 return events.map(describeAcpEvent).filter((l):l is AcpLine=>l!==null);
}

function cleanText(v:unknown,max:number):string{
 const s=typeof v==='string'?v:'';
 // Agent-controlled text: strip control and bidi/zero-width characters, cap the length.
 // eslint-disable-next-line no-control-regex
 const c=s.replace(/[\u0000-\u001f\u007f\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,' ');
 return c.length>max?c.slice(0,max)+'\u2026':c;
}
