import {invoke,isTauri} from '@tauri-apps/api/core';
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
const KEY_VALUE=/([\w-]*(?:key|token|secret|password|passwd|authorization|credential)[\w-]*["']?\s*[:=]\s*["']?)(?!\/\/)[^\s"',;&]+/gi;
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
 if(isTauri()){try{body=await invoke<string>('log_tail',{lines});}catch(e){body=`(log file unavailable: ${describeError(e)})\n`;}}
 if(!body)body=buffer.slice(-lines).map(e=>JSON.stringify(e)).join('\n');
 return redactText(`${versionInfo()}\nCreated ${new Date().toISOString()}\n\n--- last ${lines} log lines ---\n${body}\n`);
}
/** Puts the error report on the clipboard. Returns false (and says so) when the clipboard is not available. */
export async function copyErrorReport():Promise<boolean>{
 try{const text=await buildErrorReport();await navigator.clipboard.writeText(text);log('info','log','Error report copied');noticeSink?.('Error report copied. Paste it into a message to send it.');return true;}
 catch(e){reportError('log','Could not copy the error report',{level:'warn'});noticeSink?.('Could not copy the error report (clipboard not available).');void e;return false;}
}
