/** KaTeX wrapper. KaTeX (and its CSS and fonts) is a separate chunk that loads on first use, so pages without math never pay for it. */
import {useSyncExternalStore} from 'react';
import {PLACEHOLDER,type MathItem} from './mathExtract';
export type EngineStatus='idle'|'loading'|'ready'|'failed';
type Katex=typeof import('katex').default;
let katex:Katex|null=null;let status:EngineStatus='idle';let pending:Promise<void>|null=null;
const listeners=new Set<()=>void>();
const setStatus=(s:EngineStatus)=>{status=s;listeners.forEach(l=>l());};
export const getEngineStatus=()=>status;
export const subscribeEngine=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const useMathEngine=()=>useSyncExternalStore(subscribeEngine,getEngineStatus,getEngineStatus);
/** Loads KaTeX once. Safe to call repeatedly; a failed load can be retried by calling again. */
export function loadMathEngine():Promise<void>{
 if(katex)return Promise.resolve();
 if(pending)return pending;
 setStatus('loading');
 pending=Promise.all([import('katex'),import('katex/dist/katex.min.css')]).then(([m])=>{katex=m.default;setStatus('ready');}).catch(()=>{setStatus('failed');}).finally(()=>{pending=null;});
 return pending;}
export interface MathResult{html:string;/** Error text (plain). Missing when the formula is fine. */error?:string;/** Offset into the formula where KaTeX reports the problem, when known. */offset?:number}
/** KaTeX paints unknown commands in this colour instead of failing; we look for it to report them as errors. */
const ERR_COLOR='#cc0001';
const cache=new Map<string,MathResult>();
const MAX_CACHE=800;
const entities=(s:string)=>s.replace(/&quot;/g,'"').replace(/&#(x?)([0-9a-f]+);/gi,(_m,x:string,n:string)=>String.fromCharCode(parseInt(n,x?16:10))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
export const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
/** Renders one formula, or returns null while the engine is not loaded. Results are cached by (source, display mode). */
export function renderMath(tex:string,display:boolean):MathResult|null{
 if(!katex)return null;
 const key=(display?'D':'I')+tex;const hit=cache.get(key);if(hit)return hit;
 const blocked:string[]=[];
 let html='';
 try{html=katex.renderToString(tex,{displayMode:display,throwOnError:false,output:'html',strict:'ignore',maxSize:50,maxExpand:1000,errorColor:ERR_COLOR,
  // Same as trust:false, but we learn which command was refused so the message can say so.
  trust:ctx=>{blocked.push(String(ctx.command??''));return false;}});}
 catch(e){html='';const m=e instanceof Error?e.message:String(e);const res:MathResult={html:'',error:m.replace(/^KaTeX parse error:\s*/,'')};return remember(key,res);}
 let res:MathResult;
 if(blocked.length)res={html:'',error:`${blocked[0]} is disabled in Somnia (security)`};
 else if(html.includes('class="katex-error"')){const title=/title="([^"]*)"/.exec(html);const msg=entities(title?.[1]??'Invalid formula').replace(/^(KaTeX parse error|ParseError):\s*/,'');const pos=/at position (\d+)/.exec(msg);res={html:'',error:msg,offset:pos?Math.max(0,Number(pos[1])-1):undefined};}
 else if(html.includes(`color:${ERR_COLOR}`)){const cmd=new RegExp(`color:${ERR_COLOR};"[^>]*>(?:<[^>]*>)*([^<]+)<`).exec(html);res={html:'',error:`Undefined or unsupported command ${entities(cmd?.[1]??'')}`.trim()};}
 else res={html};
 return remember(key,res);}
function remember(key:string,res:MathResult){if(cache.size>=MAX_CACHE)cache.delete(cache.keys().next().value as string);cache.set(key,res);return res;}
export interface MathProblem{line:number;message:string;severity:'error'|'warning'}
/** Collects stats while formulas are turned into HTML. One sink per render pass. */
export interface MathSink{fn:(item:MathItem)=>string;count:number;errors:MathProblem[];pending:boolean}
export function makeSink():MathSink{
 const sink:MathSink={count:0,errors:[],pending:false,fn(item){
  sink.count++;
  const r=renderMath(item.tex,item.display);
  if(!r){sink.pending=true;return item.display?'<span class="math-skel-block" aria-hidden="true"></span>':'<span class="math-skel" aria-hidden="true"></span>';}
  if(r.error){const extra=r.offset!==undefined?item.tex.slice(0,r.offset).split('\n').length-1:0;sink.errors.push({line:item.line+extra,message:`Math: ${r.error}`,severity:'error'});
   return item.display?`<span class="math-error-block" role="note"><code>${esc(item.tex)}</code><span class="math-error-msg">${esc(r.error)}</span></span>`:`<span class="math-error" role="note" title="${esc(r.error)}">${esc(item.tex)}</span>`;}
  return `<span class="${item.display?'math-block':'math-inline'}" role="math" aria-label="${esc(item.tex)}">${r.html}</span>`;}};
 return sink;}
/** Swaps placeholders made by extractMath for formula HTML. */
export function fillMath(html:string,items:MathItem[],sink:MathSink):string{return html.replace(PLACEHOLDER,(_m,i:string)=>sink.fn(items[+i]));}
export function _resetMathForTests(){katex=null;status='idle';cache.clear();}
export function _setKatexForTests(k:Katex){katex=k;status='ready';}
