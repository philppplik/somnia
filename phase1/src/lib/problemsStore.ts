import {getRing,recentLog,redactText,redactValue,subscribeLogEntries,subscribeReportedFailures,type LogEntry} from './log';
import {ERROR_META} from '../generated/errorIds';
import type {ReportedFailure} from './diagnostics/ids';
export interface ProblemTarget {studio:string;file?:string;line?:number;col?:number}
export interface RuntimeProblem extends ProblemTarget {key:string;severity:'error'|'warning';message:string;details:string;source:string;ts:string;count:number;errorId?:string;incidentId?:string;messageKey?:string}
const LIMIT=500;
/** Session-only local view. Never persisted or included in safe diagnostics exports. */
export function createProblemsStore(target:()=>ProblemTarget=()=>({studio:'app'})){
 let rows:readonly RuntimeProblem[]=[];let dropped=0;
 const listeners=new Set<()=>void>();
 const emit=()=>{for(const fn of [...listeners]){try{fn();}catch{/* observers are isolated */}}};
 function add(input:Omit<RuntimeProblem,'key'|'count'>){
  const key=input.incidentId?`incident:${input.incidentId}`:`${input.studio}|${input.file??''}|${input.source}|${input.message}|${input.details}`;
  const found=rows.find(r=>r.key===key);
  // Repeated reports retain their technical detail and count, not duplicate rows.
  rows=found?rows.map(r=>r.key===key?{...r,ts:input.ts,count:r.count+1}:r):[...rows,{...input,key,count:1}];
  if(rows.length>LIMIT){dropped+=rows.length-LIMIT;rows=rows.slice(-LIMIT);}emit();
 }
 function legacy(e:LogEntry){
  if(e.level!=='error'&&e.level!=='warn')return;
  const c=e.context&&typeof e.context==='object'?e.context as Record<string,unknown>:{};
  const thrown=c.error&&typeof c.error==='object'?c.error as Record<string,unknown>:{};
  if(thrown.expected===true)return;
  const current=target();
  const explicit=typeof c.studio==='string'?c.studio:undefined;
  const prefix=e.source.split('.')[0];
  const studio=explicit??(['code','documents','sheets','slides','sound','video','design','vector','photos'].includes(prefix)?prefix:current.studio);
  add({incidentId:typeof c.incident_id==='string'&&c.incident_id?c.incident_id:typeof thrown.incident_id==='string'&&thrown.incident_id?thrown.incident_id:undefined,studio,file:typeof c.file==='string'?redactText(c.file):explicit&&explicit!==current.studio?undefined:current.file,line:typeof c.line==='number'&&c.line>0?c.line:undefined,col:typeof c.col==='number'&&c.col>0?c.col:undefined,severity:e.level==='warn'?'warning':'error',source:e.source,message:redactText(e.message),details:JSON.stringify(redactValue(c),null,2),ts:e.ts});
 }
 function failure(f:ReportedFailure){
  if(f.expected)return;
  const line=getRing().find(l=>l.incident_id===f.incidentId);
  const current=target();
  add({...current,severity:f.level==='warn'?'warning':'error',source:line?.context.cmd?String(line.context.cmd):line?.source??'native',message:line?.message||f.id,details:JSON.stringify({id:f.id,incident_id:f.incidentId,fingerprint:f.fingerprint,corr:f.corr,context:line?.context},null,2),ts:line?.ts??new Date().toISOString(),errorId:f.id,incidentId:f.incidentId,messageKey:f.userMessageKey+'.title'});
 }
 let stops:(()=>void)[]=[];
 return {getSnapshot:()=>rows,getDropped:()=>dropped,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},add,legacy,failure,
  clear(){rows=[];dropped=0;emit();},
  start(){if(stops.length)return;for(const e of recentLog())legacy(e);for(const l of getRing()){if(l.expected||!l.incident_id||(l.level!=='warn'&&l.level!=='error'))continue;failure({id:l.id,incidentId:l.incident_id as ReportedFailure['incidentId'],expected:false,level:l.level,fatal:!!l.fatal,fingerprint:l.fingerprint,userMessageKey:ERROR_META[l.id].messageKey});}stops=[subscribeLogEntries(legacy),subscribeReportedFailures(failure)];},
  stop(){stops.forEach(fn=>fn());stops=[];}
 };
}
