import type {TextRun} from './editCopy';
import type {SlidesSession} from './session';
export interface TextSelection {source:string;slide:number;run:number}
export function selectedRun(s:Pick<SlidesSession,'source'|'index'|'runs'>,selected:TextSelection|null){return selected?.source===s.source&&selected.slide===s.index?s.runs.find(r=>r.slide===selected.slide&&r.run===selected.run):undefined;}
export function slideOutline(runs:readonly TextRun[],slides:number,query=''){
 const q=query.trim().toLocaleLowerCase();
 return Array.from({length:slides},(_,index)=>{const texts=runs.filter(r=>r.slide===index);return {index,texts,title:texts.find(r=>r.text.trim())?.text.trim()??''};}).filter(s=>!q||String(s.index+1)===q||s.texts.some(r=>r.text.toLocaleLowerCase().includes(q)));
}
export function textIssue(text:string):'size'|'characters'|null{
 if(new TextEncoder().encode(text).length>16384)return 'size';
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text))return 'characters';
 return null;
}
export function deckMetrics(s:Pick<SlidesSession,'summary'|'runs'|'working'|'wasmBytes'>){return {slides:s.summary?.slides??0,runs:s.runs.length,words:s.runs.reduce((n,r)=>n+(r.text.trim()?r.text.trim().split(/\s+/u).length:0),0),bytes:s.working?.byteLength??0,wasmBytes:s.wasmBytes};}
