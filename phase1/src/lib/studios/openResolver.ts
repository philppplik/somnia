import {sniffMedia} from '../media';
import {sniffOffice,isZip,type OfficeKind} from '../office/zipProbe';
import {readyHandlersFor,handlerForStudio,type OpenHandler,type OpenKind} from './openHandlers';
import type {StudioId} from './registry';
/** Pure, deterministic, local: no AI, no network, no state. Suffix is a hint, bytes decide. */
export const MAX_OPEN_TEXT_BYTES=2_000_000;
export type OpenResolution=
 |{status:'ready';kind:OpenKind;handler:OpenHandler;studioId:StudioId;preview:boolean;mismatch?:string}
 |{status:'choose-handler';kind:OpenKind;candidates:OpenHandler[];reason:string}
 |{status:'safe-text-offer';kind:'text';handler:OpenHandler;reason:string}
 |{status:'unsupported';reason:string}
 |{status:'invalid';reason:string};
export interface ResolveOptions{
 /** Explicit "open with" target. Honoured only when that Studio can read the validated kind. */
 target?:StudioId;
 /** Per-document override (e.g. studioByTab). Honoured only when compatible; never carried over to other documents. */
 preferred?:StudioId;
 /** Caller accepted the verified-text offer (unknown suffix, valid text). */
 acceptTextOffer?:boolean;
}
const EXT_KIND:Record<string,OpenKind>={docx:'docx',xlsx:'xlsx',pptx:'pptx',mp3:'audio',wav:'audio',flac:'audio',ogg:'audio',oga:'audio',aif:'audio',aiff:'audio',mp4:'video',m4v:'video',mov:'video',webm:'video',mkv:'video',pdf:'pdf',psd:'psd',png:'image',jpg:'image',jpeg:'image',webp:'image'};
const KNOWN_TEXT=/^(html?|css|js|jsx|ts|tsx|json|svg|txt|md|markdown|tex|xml|yml|yaml|csv|somdesign)$/;
const ext=(name:string)=>(name.includes('.')?name.split('.').pop()!:'').toLowerCase();
/** UTF-16 with BOM counts as text. Otherwise NUL bytes or many control characters mean binary. */
export function looksLikeText(b:Uint8Array):boolean{
 if(b.length===0)return true;
 if((b[0]===0xff&&b[1]===0xfe)||(b[0]===0xfe&&b[1]===0xff))return true;
 const n=Math.min(b.length,8192);let bad=0;
 for(let i=0;i<n;i++){const c=b[i];if(c===0)return false;if(c<32&&c!==9&&c!==10&&c!==13&&c!==12&&c!==27)bad++;}
 return bad/n<0.02;
}
function sniffSvg(b:Uint8Array):boolean{return /<svg[\s>]/i.test(new TextDecoder('utf-8').decode(b.subarray(0,Math.min(b.length,4096))));}
export interface ClassifyResult{kind:OpenKind|null;error?:string;unsupported?:string;mismatch?:string;textOffer?:boolean}
/** Kind from content. `full` is only read for Office packages. */
export function classify(name:string,bytes:Uint8Array):ClassifyResult{
 const e=ext(name);const implied=EXT_KIND[e];const officeExt=e==='docx'||e==='xlsx'||e==='pptx';
 let office:OfficeKind|null=null;
 if(officeExt||isZip(bytes))office=sniffOffice(bytes);
 if(office){
  const mismatch=officeExt&&office!==e?`${name} is a ${office.toUpperCase()} document, not a ${e.toUpperCase()}.`:undefined;
  return{kind:office,mismatch};
 }
 const media=sniffMedia(bytes);
 if(media){
  const kind=media.kind as OpenKind;
  const mismatch=implied&&implied!==kind&&!(implied==='image'&&kind==='raster-preview')?`${name} contains ${kind==='raster-preview'?'image':kind} data, not ${implied}.`:undefined;
  return{kind,mismatch};
 }
 if(/\.tga$/i.test(name)&&bytes.length>18)return{kind:'raster-preview'};
 if(officeExt)return{kind:null,error:`${name} is not a valid ${e.toUpperCase()} file.`};
 if(e==='psd')return{kind:null,error:`${name} is not a valid PSD v1 file.`};
 if(implied)return{kind:null,error:`${name} is not a valid ${implied==='image'?'supported raster image':implied} file.`};
 if(isZip(bytes))return{kind:null,unsupported:`${name} is a ZIP package Somnia has no editor for.`};
 if(!looksLikeText(bytes))return{kind:null,unsupported:`${name} is a binary file Somnia has no editor for.`};
 if(bytes.length>MAX_OPEN_TEXT_BYTES)return{kind:null,unsupported:`${name} is larger than ${MAX_OPEN_TEXT_BYTES/1_000_000} MB and cannot be opened as text.`};
 if(e==='svg'||(!KNOWN_TEXT.test(e)&&sniffSvg(bytes)))return sniffSvg(bytes)?{kind:'svg'}:{kind:'text'};
 return{kind:'text',textOffer:!KNOWN_TEXT.test(e)};
}
/** Picks a handler. Order: explicit target, compatible per-document override, priority; equal priority without a default asks. */
export function pickHandler(kind:OpenKind,opts:ResolveOptions={}):{handler:OpenHandler}|{candidates:OpenHandler[]}|null{
 const ready=readyHandlersFor(kind);if(!ready.length)return null;
 for(const wanted of [opts.target,opts.preferred]){if(!wanted)continue;const h=handlerForStudio(kind,wanted);if(h)return{handler:h};}
 const top=Math.max(...ready.map(h=>h.priority));const best=ready.filter(h=>h.priority===top);
 if(best.length===1)return{handler:best[0]};
 const def=best.find(h=>h.isDefault);return def?{handler:def}:{candidates:best};
}
export function resolveOpen(name:string,bytes:Uint8Array,opts:ResolveOptions={}):OpenResolution{
 const c=classify(name,bytes);
 if(c.error)return{status:'invalid',reason:c.error};
 if(c.unsupported||!c.kind)return{status:'unsupported',reason:c.unsupported??`${name} cannot be opened.`};
 // A content/suffix mismatch never renames or converts. It asks, and the explicit target (the user's "Open as ...") confirms it.
 if(c.mismatch&&!opts.target)return{status:'choose-handler',kind:c.kind,candidates:readyHandlersFor(c.kind),reason:c.mismatch};
 const picked=pickHandler(c.kind,opts);
 if(!picked){
  // Text-like kinds always have Code. Anything else without a ready handler is reported, never forced into the current Studio.
  return{status:'unsupported',reason:`No ready editor can open ${name} (${c.kind}).`};
 }
 if('candidates' in picked)return{status:'choose-handler',kind:c.kind,candidates:picked.candidates,reason:`More than one editor can open ${name}.`};
 if(c.textOffer&&!opts.acceptTextOffer)return{status:'safe-text-offer',kind:'text',handler:picked.handler,reason:`${name} has an unknown type. It is valid text and can be opened in Code.`};
 return{status:'ready',kind:c.kind,handler:picked.handler,studioId:picked.handler.studioId,preview:picked.handler.capability==='preview',mismatch:c.mismatch};
}
