import {invoke,isTauri} from '@tauri-apps/api/core';
import {ERROR_META,type ErrorId} from '../generated/errorIds';
import type {IncidentId,ReportedFailure} from './diagnostics/ids';
import {CONTEXT_ALLOW,EXPORT_CONTEXT_ALLOW,LEVELS_V2,type BuildIdentity,type Ctx,type Level,type LogLine,type SafeLogEvent} from './log.types';
/**
 * One logging path for the whole app. Entries go to an in-memory ring buffer and, in the desktop app, to the rotating log file
 * in the app data folder (written by the Rust service, which also records its own errors and panics there).
 * Everything is redacted before it is stored: API keys, tokens, passwords never reach the log or an error report.
 */
export type LogLevel='debug'|'info'|'warn'|'error';
export interface LogEntry{ts:string;level:LogLevel;source:string;message:string;context?:unknown}
const LEVELS:LogLevel[]=['debug','info','warn','error'];
const BUFFER_MAX=300,MAX_MESSAGE=4000,SENSITIVE_KEY=/key|token|secret|password|passwd|authorization|credential|cookie/i;
const TOKEN_PREFIX=/\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[a-z]-[A-Za-z0-9-]{8,}|AIza[A-Za-z0-9_-]{20,}|glpat-[A-Za-z0-9_-]{10,})/g;
const BEARER=/(\bbearer\s+)[^\s"',;]+/gi;
const KEY_VALUE=/([\w-]*(?:key|token|secret|password|passwd|authorization|credential|cookie)[\w-]*["']?\s*[:=]\s*["']?)(?!\/\/)[^\s"',;&]+/gi;
/** Masks secrets in free text. */
export function redactText(input:string):string{return input.replace(TOKEN_PREFIX,'[redacted]').replace(BEARER,'$1[redacted]').replace(KEY_VALUE,'$1[redacted]');}
const clip=(s:string,n=MAX_MESSAGE)=>s.length>n?s.slice(0,n)+'...[truncated]':s;
/** Makes any value JSON-safe, bounded and secret-free. Errors keep name, message and the top of the stack. */
export function redactValue(value:unknown,depth=0):unknown{
 if(value==null||typeof value==='number'||typeof value==='boolean')return value;
 if(typeof value==='string')return clip(redactText(value),1000);
 if(value instanceof Error)return{name:value.name,message:clip(redactText(value.message),1000),stack:value.stack?redactText(value.stack.split('\n').slice(0,6).join('\n')):undefined};
 if(depth>=4)return'[nested]';
 if(Array.isArray(value))return value.slice(0,20).map(v=>redactValue(v,depth+1));
 if(typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).slice(0,30).map(([k,v])=>[k,SENSITIVE_KEY.test(k)?'[redacted]':redactValue(v,depth+1)]));
 return String(value).slice(0,100);
}
/** Short, secret-free description of anything that was thrown. */
export function describeError(error:unknown,max=1000):string{
 if(error instanceof Error){const code=(error as {code?:unknown}).code;return clip(redactText(`${error.name}${typeof code==='string'?` [${code}]`:''}: ${error.message}`),max);}
 return clip(redactText(typeof error==='string'?error:(()=>{try{return JSON.stringify(error)??String(error);}catch{return String(error);}})()),1000);
}
const buffer:LogEntry[]=[];
let noticeSink:((text:string)=>void)|null=null;
let lastKey='',lastAt=0,suppressed=0;
/** The UI registers how a non-blocking hint is shown (the status notice). Kept out of this module to avoid import cycles. */
export function setNoticeSink(fn:((text:string)=>void)|null){noticeSink=fn;}
export function recentLog():LogEntry[]{return buffer.slice();}
export function clearLogBuffer(){buffer.length=0;lastKey='';suppressed=0;}
function toNative(entry:LogEntry){
 if(!isTauri())return;
 try{void invoke('log_write',{level:entry.level,source:entry.source,message:entry.message,context:entry.context??null}).catch(()=>{});}catch{/* logging must never throw */}
}
export function log(level:LogLevel,source:string,message:string,context?:unknown):void{
 try{
  if(!LEVELS.includes(level))level='info';
  const key=`${level}|${source}|${message}`,now=Date.now();
  // An error inside a render loop must not flood the file: identical entries within a second are counted, not repeated.
  if(key===lastKey&&now-lastAt<1000){suppressed++;lastAt=now;return;}
  lastKey=key;lastAt=now;
  if(suppressed>0){const n=suppressed;suppressed=0;push({ts:new Date().toISOString(),level:'info',source:'log',message:`${n} identical entries suppressed`});}
  push({ts:new Date().toISOString(),level,source:clip(redactText(source),80),message:clip(redactText(message)),context:context===undefined?undefined:redactValue(context)});
 }catch{/* logging must never throw */}
}
function push(entry:LogEntry){buffer.push(entry);if(buffer.length>BUFFER_MAX)buffer.shift();toNative(entry);if(import.meta.env?.DEV&&entry.level==='error')console.error(`[${entry.source}] ${entry.message}`);}
export const logInfo=(source:string,message:string,context?:unknown)=>log('info',source,message,context);
export const logWarn=(source:string,message:string,context?:unknown)=>log('warn',source,message,context);
/** Logs an error. With `notify`, also shows a short non-blocking hint in the UI (the log keeps the detail). */
export function reportError(source:string,error:unknown,options:{notify?:string;message?:string;context?:unknown;level?:LogLevel}={}):void{
 log(options.level??'error',source,options.message?`${options.message}: ${describeError(error)}`:describeError(error),{...(options.context&&typeof options.context==='object'?options.context as object:{}),error});
 if(options.notify)notifyHint(options.notify);
}
export function notifyHint(text:string){try{noticeSink?.(`${text} Details are in the log (Help > Copy error report).`);}catch{/* hint is best effort */}}
let installed=false;
/** Unhandled errors and promise rejections end up in the log and show one quiet hint instead of failing silently. */
export function installGlobalErrorHandlers(target:Pick<Window,'addEventListener'>=window):void{
 if(installed)return;installed=true;
 target.addEventListener('error',e=>{const ev=e as ErrorEvent;
  // Resource load failures (img/script/link) arrive here without an Error; they say which URL failed.
  const el=(ev as unknown as {target?:{tagName?:string;src?:string;href?:string}}).target;
  if(el&&el.tagName&&!ev.error&&!ev.message){reportError('frontend.resource',`Failed to load <${el.tagName.toLowerCase()}> ${String(el.src||el.href||'').split('?')[0]}`,{level:'warn'});return;}
  reportError('frontend.unhandled',ev.error??ev.message,{context:{file:ev.filename,line:ev.lineno,col:ev.colno},notify:'Something went wrong.'});},true);
 target.addEventListener('unhandledrejection',e=>{reportError('frontend.rejection',(e as PromiseRejectionEvent).reason,{notify:'Something went wrong in the background.'});});
}
export function versionInfo():string{
 const release=typeof __APP_RELEASE__!=='undefined'?__APP_RELEASE__:'dev',app=typeof __APP_VERSION__!=='undefined'?__APP_VERSION__:'dev';
 const nav=typeof navigator!=='undefined'?navigator.userAgent:'node';
 return `Somnia ${release} (app ${app}) · ${isTauri()?'desktop':'web'} · ${nav}`;
}
/** Version header plus the latest log lines. Secrets are masked again here in case an older file predates a rule. */
export async function buildErrorReport(lines=150):Promise<string>{
 let body='';
 let tailFailed=false;
 if(isTauri()){try{body=await invoke<string>('log_tail',{lines});}catch(e){body=`(log file unavailable: ${describeError(e)})\n`;tailFailed=true;}}
 // Frontend lines normally reach the file via log_write, so only fall back to the ring buffer when the tail failed or is empty.
 const ring=buffer.slice(-lines).map(e=>JSON.stringify(e)).join('\n');
 if(!body)body=ring;else if(tailFailed)body+=ring;
 return redactText(`${versionInfo()}\nCreated ${new Date().toISOString()}\n\n--- last ${lines} log lines ---\n${body}\n`);
}
/** Puts the error report on the clipboard. Returns false (and says so) when the clipboard is not available. */
export async function copyErrorReport():Promise<boolean>{
 try{const text=await buildErrorReport();await navigator.clipboard.writeText(text);log('info','log','Error report copied');noticeSink?.('Error report copied. Paste it into a message to send it.');return true;}
 catch(e){reportError('log','Could not copy the error report',{level:'warn'});noticeSink?.('Could not copy the error report (clipboard not available).');void e;return false;}
}

/* ---------------------------------------------------------------------------------------------
 * Schema v2: typed events with registry ids (logEvent). The functions above stay as the legacy
 * path (no id) until the call sites are migrated.
 * ------------------------------------------------------------------------------------------- */
export type {ReportedFailure,IncidentId,RequestId,SafeLogEvent as SafeLogEventDto,BuildIdentity} from './diagnostics/ids';
export type {LogLine,Level,Ctx} from './log.types';
const RING_MAX=500,RATE_CAPACITY=5,RATE_REFILL_MS=60_000/5,RATE_TABLE_MAX=200,CAUSE_MAX=500,CTX_STRING_MAX=64;
const CROCKFORD='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function randomBytes(n:number):Uint8Array{
 const a=new Uint8Array(n);
 try{globalThis.crypto.getRandomValues(a);}catch{for(let i=0;i<n;i++)a[i]=Math.floor(Math.random()*256);}
 return a;
}
/** ULID: 48-bit ms timestamp plus 80 random bits, Crockford base32, 26 characters. */
export function newUlid(now=Date.now()):string{
 let t=now,time='';
 for(let i=0;i<10;i++){time=CROCKFORD[t%32]+time;t=Math.floor(t/32);}
 let rand='';for(const b of randomBytes(16))rand+=CROCKFORD[b%32];
 return time+rand.slice(0,16);
}
const SESSION=newUlid();
let seqCounter=0;
const ring:LogLine[]=[];
const subscribers=new Set<(f:ReportedFailure)=>void>();
const health={ringDropped:0,droppedFields:0,suppressed:0,expected:0,lastWriteError:undefined as string|undefined};
const buckets=new Map<string,{tokens:number;at:number;suppressed:number}>();
/** Session id of this renderer process (ULID). Part of the merge key (session, source, seq). */
export const logSession=SESSION;
function buildIdentity():BuildIdentity{
 const release=typeof __APP_RELEASE__!=='undefined'?__APP_RELEASE__:'dev';
 const app=typeof __APP_VERSION__!=='undefined'?__APP_VERSION__:'dev';
 return{release,sha:'unknown',channel:'unknown',arch:'unknown',frontend_build:app};
}
const FNV_OFFSET=0xcbf29ce484222325n,FNV_PRIME=0x100000001b3n,MASK64=(1n<<64n)-1n;
/** FNV-1a 64 bit over the UTF-8 bytes, as 16 lowercase hex characters. The Rust side must implement the same function. */
export function fp64(input:string):string{
 let h=FNV_OFFSET;
 for(const b of new TextEncoder().encode(input)){h^=BigInt(b);h=(h*FNV_PRIME)&MASK64;}
 return h.toString(16).padStart(16,'0');
}
/** Normalizes redacted text so equal failures share a fingerprint: paths, ids, long hex and digits are replaced. */
export function normalizeForFingerprint(text:string):string{
 return redactText(text)
  .replace(/(?:[A-Za-z]:\\|\\\\|\/)[^\s"'<>|]*[\\\/][^\s"'<>|]*/g,'<path>')
  .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,'<id>')
  .replace(/\b[0-7][0-9A-HJKMNP-TV-Z]{25}\b/g,'<id>')
  .replace(/\b[0-9a-f]{8,}\b/gi,'<hex>')
  .replace(/\d+/g,'#');
}
function topFrames(stack:string|undefined,n=3):string{
 if(!stack)return'';
 return stack.split('\n').slice(1).map(l=>l.trim()).filter(l=>/^at\s/.test(l)).slice(0,n).map(l=>normalizeForFingerprint(l.replace(/\(.*[\\\/]([^\\\/)]*)\)/,'($1)'))).join(';');
}
function sanitizeContext(ctx:Record<string,unknown>|undefined):Ctx{
 const out:Ctx={};
 if(!ctx)return out;
 for(const [k,v] of Object.entries(ctx)){
  const kind=Object.prototype.hasOwnProperty.call(CONTEXT_ALLOW,k)?CONTEXT_ALLOW[k]:undefined;
  if(kind==='number'&&typeof v==='number'&&Number.isFinite(v))out[k]=v;
  else if(kind==='string'&&typeof v==='string')out[k]=clip(redactText(v).replace(/(?:[A-Za-z]:\\|\\\\|\/)[^\s]*[\\\/][^\s]*/g,'<path>').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,''),CTX_STRING_MAX);
  else health.droppedFields++;
 }
 return out;
}
function rateAllow(fp:string,now:number):{allow:boolean;suppressed:number}{
 let b=buckets.get(fp);
 if(!b){
  if(buckets.size>=RATE_TABLE_MAX){const first=buckets.keys().next().value;if(first!==undefined)buckets.delete(first);}
  b={tokens:RATE_CAPACITY,at:now,suppressed:0};buckets.set(fp,b);
 }
 b.tokens=Math.min(RATE_CAPACITY,b.tokens+(now-b.at)/RATE_REFILL_MS);b.at=now;
 if(b.tokens<1){b.suppressed++;return{allow:false,suppressed:0};}
 b.tokens-=1;const sup=b.suppressed;b.suppressed=0;return{allow:true,suppressed:sup};
}
export interface LogEventOptions{
 /** Free text cause or the thrown value. Redacted and normalized before it is stored. */
 cause?:string|unknown;
 context?:Record<string,unknown>;
 expected?:boolean;corr?:string;level?:Level|string;
 /** Requests fatal. Honored only when the registry marks the id as fatal. */
 fatal?:boolean;
 window?:string;dur_ms?:number;
}
function pushRing(line:LogLine){
 ring.push(line);
 if(ring.length>RING_MAX){ring.shift();health.ringDropped++;}
 if(!isTauri())return;
 try{void invoke('log_write',{level:line.level,source:line.source,message:`${line.id} ${line.message}`,context:{...line.context,v:2,id:line.id,session:line.session,seq:line.seq,fingerprint:line.fingerprint,incident_id:line.incident_id,corr:line.corr,expected:line.expected,fatal:line.fatal}}).catch((e:unknown)=>{health.lastWriteError=describeError(e,200);});}
 catch(e){health.lastWriteError=describeError(e,200);}
}
/**
 * Logs a typed event. Returns a ReportedFailure for the UI, or null when the event is expected,
 * below warn level, or suppressed by the per-fingerprint rate limit. Never throws.
 * Subscribers of subscribeReportedFailures run synchronously after the write.
 */
export function logEvent(id:ErrorId,o:LogEventOptions={}):ReportedFailure|null{
 try{
  const meta=ERROR_META[id];
  const now=Date.now();
  let level:Level,levelRaw:string|undefined;
  const wanted=o.level??meta.severity;
  if((LEVELS_V2 as readonly string[]).includes(wanted as string))level=wanted as Level;else{level='error';levelRaw=String(wanted).slice(0,32);}
  const err=o.cause instanceof Error?o.cause:undefined;
  const causeText=o.cause===undefined?'':err?describeError(err,CAUSE_MAX):typeof o.cause==='string'?o.cause:describeError(o.cause,CAUSE_MAX);
  const message=clip(normalizeCauseForStorage(causeText),CAUSE_MAX);
  const fingerprint=fp64(`${id}|${normalizeForFingerprint(causeText)}|${topFrames(err?.stack)}`);
  const expected=o.expected??meta.expected;
  const gate=rateAllow(fingerprint,now);
  if(!gate.allow){health.suppressed++;return null;}
  if(expected)health.expected++;
  const fatal=o.fatal===true&&meta.fatal;
  const context=sanitizeContext(o.context);
  const reportable=!expected&&(level==='warn'||level==='error');
  const incidentId=reportable?newUlid(now):undefined;
  const line:LogLine={v:2,ts:new Date(now).toISOString(),level,...(levelRaw?{level_raw:levelRaw}:{}),...(fatal?{fatal:true}:{}),source:'ts',id,category:meta.category,message,context,session:SESSION,seq:++seqCounter,...(incidentId?{incident_id:incidentId}:{}),...(o.corr?{corr:clip(o.corr,64)}:{}),build:buildIdentity(),...(o.window?{window:clip(o.window,CTX_STRING_MAX)}:{}),...(typeof o.dur_ms==='number'?{dur_ms:o.dur_ms}:{}),expected,fingerprint,...(gate.suppressed>0?{suppressed:gate.suppressed}:{})};
  pushRing(line);
  if(!reportable||!incidentId)return null;
  const failure:ReportedFailure={id,incidentId:incidentId as IncidentId,expected,level:level as 'warn'|'error',fatal,fingerprint,userMessageKey:meta.messageKey,...(line.corr?{corr:line.corr}:{}),...(typeof context.ordinal==='number'?{ordinal:context.ordinal}:{})};
  publishReportedFailure(failure);
  return failure;
 }catch(e){health.lastWriteError=describeError(e,200);return null;}
}
function normalizeCauseForStorage(text:string):string{
 return redactText(text).replace(/(?:[A-Za-z]:\\|\\\\|\/)[^\s"'<>|]*[\\\/][^\s"'<>|]*/g,'<path>').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'');
}
/** Convenience for fatal events: same as logEvent with fatal:true (honored only for registry-fatal ids). */
export function logFatal(id:ErrorId,o:Omit<LogEventOptions,'fatal'>={}):ReportedFailure|null{return logEvent(id,{...o,fatal:true});}
/** Subscribes to failures worth showing the user. Fires synchronously after the log write. Returns the unsubscribe function. */
export function subscribeReportedFailures(fn:(f:ReportedFailure)=>void):()=>void{subscribers.add(fn);return()=>{subscribers.delete(fn);};}
/** Delivers a failure that originated outside logEvent (Rust event som://failure, cmd() errors). Payload must already be allowlisted. Subscriber errors never propagate. */
export function publishReportedFailure(f:ReportedFailure):void{
 for(const fn of [...subscribers]){try{fn(f);}catch{/* a failing subscriber must not break logging */}}
}
/** The v2 ring (last 500 lines). Lines keep their (session, source, seq) key when copied into reports. */
export function getRing():LogLine[]{return ring.slice();}
export function clearRing():void{ring.length=0;buckets.clear();health.ringDropped=0;health.droppedFields=0;health.suppressed=0;health.expected=0;health.lastWriteError=undefined;}
export interface LoggerHealth{ok:boolean;lastWriteError?:string;ringSize:number;dropped:number;droppedFields:number;suppressed:number;expected:number;sinceSeq:number;session:string}
export function getLoggerHealth():LoggerHealth{
 return{ok:health.lastWriteError===undefined,...(health.lastWriteError?{lastWriteError:health.lastWriteError}:{}),ringSize:ring.length,dropped:health.ringDropped,droppedFields:health.droppedFields,suppressed:health.suppressed,expected:health.expected,sinceSeq:seqCounter,session:SESSION};
}
export interface BootEntry{ts?:string;id:ErrorId;cause?:string;context?:Record<string,unknown>}
/** Moves events collected before the app booted into the log. Uses the normal path, so redaction, allowlist and rate limit apply. */
export function adoptBootBuffer(buf:BootEntry[]):void{for(const e of buf.slice(0,100))logEvent(e.id,{cause:e.cause,context:e.context});}
/**
 * Export contract: converts a line to the form allowed in the diagnostics ZIP and error report.
 * Free text (message, cause) is dropped. Only ids, flags, the merge key and allowlisted
 * technical context (counters and short tokens) survive. Legacy lines without a v2 id are dropped (null).
 */
export function toSafeLogEvent(line:unknown):SafeLogEvent|null{
 try{
  const l=line as Partial<LogLine>|null;
  if(!l||typeof l!=='object'||l.v!==2||typeof l.id!=='string'||!Object.prototype.hasOwnProperty.call(ERROR_META,l.id))return null;
  if(typeof l.session!=='string'||typeof l.seq!=='number'||typeof l.ts!=='string')return null;
  const lvl=(LEVELS_V2 as readonly string[]).includes(l.level as string)?l.level as Level:'error';
  const ctx:Record<string,string|number|boolean>={};
  for(const k of EXPORT_CONTEXT_ALLOW){
   const v=(l.context as Record<string,unknown>|undefined)?.[k];
   if(typeof v==='number'&&Number.isFinite(v))ctx[k]=v;
   else if(typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,64}$/.test(v))ctx[k]=v;
  }
  const tok=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,64}$/.test(v)?v:undefined;
  const b=l.build as Partial<BuildIdentity>|undefined;
  const build:BuildIdentity={release:tok(b?.release)??'unknown',sha:tok(b?.sha)??'unknown',channel:tok(b?.channel)??'unknown',arch:tok(b?.arch)??'unknown',frontend_build:tok(b?.frontend_build)??'unknown'};
  const out:SafeLogEvent={v:2,ts:l.ts,level:lvl,source:l.source==='rust'?'rust':'ts',id:l.id as ErrorId,session:tok(l.session)??'unknown',seq:l.seq,expected:l.expected===true,fingerprint:tok(l.fingerprint)??'unknown',build,context:ctx};
  if(l.fatal===true)out.fatal=true;
  const w=tok(l.window);if(w)out.window=w;
  const inc=tok(l.incident_id);if(inc)out.incident_id=inc;
  const c=tok(l.corr);if(c)out.corr=c;
  if(typeof l.suppressed==='number')out.suppressed=l.suppressed;
  if(typeof l.dur_ms==='number')out.dur_ms=l.dur_ms;
  return out;
 }catch{return null;}
}
/** Maps many lines through toSafeLogEvent, drops rejects, dedupes by (session, source, seq) and sorts by that key (ts only breaks ties between sessions). */
export function toSafeLogEvents(lines:readonly unknown[]):SafeLogEvent[]{
 const seen=new Map<string,SafeLogEvent>();
 for(const l of lines){const e=toSafeLogEvent(l);if(e)seen.set(`${e.session}|${e.source}|${e.seq}`,e);}
 return [...seen.values()].sort((a,b)=>a.ts<b.ts?-1:a.ts>b.ts?1:a.seq-b.seq);
}
