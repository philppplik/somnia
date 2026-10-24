import type {AnnotateOp,CellAnnotations} from './protocol';
/** Notes, comments and links: validation of untrusted command input and of the bridge answer. The Rust bridge re-validates. */
export const MAX_NOTE_CHARS=2000,MAX_LINK_BYTES=2048,MAX_LINK_TEXT=1000,MAX_TOOLTIP=255;
const bad=(t:string,max:number)=>t.length>max||/[\u0000-\u0009\u000b-\u001f\u007f]/.test(t);
/** null when the target is a web, mail or in-workbook address; otherwise why not. Nothing that runs code or reads a file. */
export function linkTargetProblem(target:string):'empty'|'long'|'scheme'|'host'|'mail'|null{
 if(target.length===0||(!target.startsWith("'")&&/\s/.test(target))||/[\u0000-\u001f\u007f]/.test(target))return 'empty';
 if(new TextEncoder().encode(target).length>MAX_LINK_BYTES)return 'long';
 const lower=target.toLowerCase();
 if(lower.startsWith('https://')||lower.startsWith('http://')){const host=lower.replace(/^https?:\/\//,'').split(/[/?#]/)[0];return host===''||host.includes('@')?'host':null;}
 if(lower.startsWith('mailto:')){const who=lower.slice(7).split('?')[0],at=who.indexOf('@');const dom=who.slice(at+1);return at>0&&dom.includes('.')&&!dom.startsWith('.')?null:'mail';}
 const bang=target.lastIndexOf('!');
 if(bang>0&&/^[A-Za-z0-9$:]{1,24}$/.test(target.slice(bang+1)))return null;
 return 'scheme';
}
export function parseAnnotateCommand(input:unknown):AnnotateOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Annotation must be an object.');
 const o=input as Record<string,unknown>,only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown annotation field.');};
 const text=(key:string,required:boolean,max:number)=>{const v=o[key];if(v===undefined&&!required)return undefined;if(typeof v!=='string')throw Error('Text must be a string.');const t=v.trim();if(required&&t==='')throw Error('Write some text first.');if(bad(t,max))throw Error('Text is too long or has control characters.');return t;};
 switch(o.kind){
  case 'note':case 'comment':case 'reply':only('kind','text');return {kind:o.kind,text:text('text',true,MAX_NOTE_CHARS) as string};
  case 'resolve':only('kind','resolved');if(typeof o.resolved!=='boolean')throw Error('resolved must be true or false.');return {kind:'resolve',resolved:o.resolved};
  case 'remove':case 'unlink':only('kind');return {kind:o.kind};
  case 'link':{only('kind','target','text','tooltip');if(typeof o.target!=='string')throw Error('Link target must be a string.');const target=o.target.trim();if(linkTargetProblem(target))throw Error('Use an http(s) address, a mailto address or Sheet!A1.');const out:AnnotateOp={kind:'link',target};const tx=text('text',false,MAX_LINK_TEXT),tip=text('tooltip',false,MAX_TOOLTIP);if(tx)out.text=tx;if(tip)out.tooltip=tip;return out;}
  default:throw Error('Unsupported annotation.');
 }
}
export function parseAnnotations(raw:{notes:unknown;links:unknown}):CellAnnotations{
 const n=Array.isArray(raw.notes)?raw.notes[0] as Record<string,unknown>|undefined:undefined,l=Array.isArray(raw.links)?raw.links[0] as Record<string,unknown>|undefined:undefined;
 const note=n&&typeof n.text==='string'?{author:typeof n.author==='string'?n.author:'',text:n.text,threaded:n.threaded===true,resolved:n.resolved===true,replies:(Array.isArray(n.replies)?n.replies:[]).filter((r):r is [string,string]=>Array.isArray(r)&&typeof r[0]==='string'&&typeof r[1]==='string').slice(0,200)}:null;
 const link=l&&typeof l.target==='string'?{target:l.target,tooltip:typeof l.tooltip==='string'?l.tooltip:null}:null;
 return {note,link};
}
/** "Sheet 2!B3:C4" -> the sheet name and first cell, or null for web and mail targets. */
export function internalTarget(target:string):{sheet:string;address:string}|null{
 if(/^(https?:|mailto:)/i.test(target))return null;const bang=target.lastIndexOf('!');if(bang<=0)return null;
 const sheet=target.slice(0,bang).replace(/^'(.*)'$/,'$1').replace(/''/g,"'"),address=target.slice(bang+1).split(':')[0].replace(/\$/g,'').toUpperCase();
 return /^[A-Z]{1,3}[0-9]{1,7}$/.test(address)?{sheet,address}:null;
}
/** One note or comment in the sheet-wide list. */
export interface NoteListItem{cell:string;author:string;text:string;threaded:boolean;resolved:boolean;replies:number}
export interface NoteList{notes:NoteListItem[];total:number;truncated:boolean}
export const MAX_LISTED_NOTES=200;
export function parseNoteList(raw:unknown):NoteList{
 const r=raw as {notes?:unknown;total?:unknown;truncated?:unknown}|null;const list=Array.isArray(r?.notes)?(r!.notes as unknown[]):[];const out:NoteListItem[]=[];
 for(const x of list.slice(0,MAX_LISTED_NOTES)){const n=x as Record<string,unknown>|null;if(!n||typeof n.cell!=='string'||!/^[A-Z]{1,3}[0-9]{1,7}$/.test(n.cell)||typeof n.text!=='string')continue;
  out.push({cell:n.cell,author:typeof n.author==='string'?n.author.slice(0,80):'',text:n.text.slice(0,300),threaded:n.threaded===true,resolved:n.resolved===true,replies:typeof n.replies==='number'&&Number.isFinite(n.replies)?Math.max(0,Math.min(100000,Math.floor(n.replies))):0});}
 return {notes:out,total:typeof r?.total==='number'&&Number.isFinite(r.total)?Math.max(out.length,Math.floor(r.total)):out.length,truncated:r?.truncated===true};
}
export const NOTE_REVIEW_KINDS=['resolve','reopen','remove'] as const;
export type NoteReviewOp={kind:typeof NOTE_REVIEW_KINDS[number];cell:string};
/** Settles or deletes one listed note, wherever the selection is. */
export function parseNoteReviewCommand(input:unknown):NoteReviewOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Note operation must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>k!=='kind'&&k!=='cell'))throw Error('Unknown note field.');
 if(typeof o.kind!=='string'||!(NOTE_REVIEW_KINDS as readonly string[]).includes(o.kind))throw Error('Unsupported note operation.');
 if(typeof o.cell!=='string'||!/^[A-Za-z]{1,3}[0-9]{1,7}$/.test(o.cell))throw Error('Name the cell of the note, like B7.');
 return {kind:o.kind as NoteReviewOp['kind'],cell:o.cell.toUpperCase()};
}
