/**
 * Footnotes and figure captions as plain-text conventions the app manages:
 * references are inline `[^n]` markers (rendered superscript), notes are paragraphs
 * `[^n]: text` under a `Footnotes` heading at the end of the body, and figure
 * captions are paragraphs `Figure n: text` directly below a picture. The engine
 * has no footnote or caption model, so the app owns numbering and placement.
 */
export interface NoteBlock{index:number;kind:string;editable:boolean;text?:string}
export interface NoteRef{block:number;num:number;start:number;end:number}
export interface NoteScan{refs:NoteRef[];notes:{block:number;num:number}[];heading:number|null;maxNum:number}
export interface NoteHunk{start:number;end:number;text:string}
export interface NoteEdit{block:number;hunks:NoteHunk[]}

export const FOOTNOTE_HEADING='Footnotes';
export const MAX_FOOTNOTES=999;
export const MAX_FIGURES=999;
const enc=new TextEncoder();
export const noteByteLen=(s:string)=>enc.encode(s).length;
const toBytes=(s:string,chars:number)=>enc.encode(s.slice(0,chars)).length;

const REF_RE=/\[\^(\d{1,3})\](?!:)/g;
const NOTE_RE=/^\[\^(\d{1,3})\]:/;
const FIGURE_RE=/^Figure (\d{1,3}):/;

/** Top-level editable paragraphs only; table cells and pictures cannot hold managed notes. */
const paras=(blocks:readonly NoteBlock[])=>blocks.filter(b=>b.kind==='para'&&b.editable&&typeof b.text==='string');

/** Inline footnote references in one paragraph, as character offsets (markers are ASCII). */
export function footnoteRefsIn(text:string):{num:number;start:number;end:number}[]{
 const out:{num:number;start:number;end:number}[]=[];
 for(const m of text.matchAll(REF_RE))out.push({num:Number(m[1]),start:m.index,end:m.index+m[0].length});
 return out;
}
/** The footnote number when a paragraph is a note definition (`[^n]: ...`), else null. */
export function footnoteNoteNum(text:string):number|null{const m=NOTE_RE.exec(text);return m?Number(m[1]):null;}

/** All footnote references, note paragraphs and the heading spot, in document order. */
export function scanFootnotes(blocks:readonly NoteBlock[]):NoteScan{
 const refs:NoteRef[]=[],notes:{block:number;num:number}[]=[];let heading:number|null=null,maxNum=0;
 for(const b of paras(blocks)){
  const n=footnoteNoteNum(b.text!);
  if(n!==null){notes.push({block:b.index,num:n});maxNum=Math.max(maxNum,n);continue;}
  if(b.text!.trim()===FOOTNOTE_HEADING&&heading===null)heading=b.index;
  for(const r of footnoteRefsIn(b.text!)){refs.push({block:b.index,...r});maxNum=Math.max(maxNum,r.num);}
 }
 return {refs,notes,heading,maxNum};
}

/** The number the next inserted footnote gets. */
export function nextFootnoteNumber(scan:NoteScan):number{return Math.min(scan.maxNum+1,MAX_FOOTNOTES+1);}

/**
 * Renumbers footnotes by order of first appearance: repeated references to the same note
 * share its new number, notes follow their reference, orphans keep their text. Hunks are
 * UTF-8 byte offsets. Empty when numbering is already in order or there is nothing to renumber.
 */
export function planFootnoteRenumber(blocks:readonly NoteBlock[]):NoteEdit[]{
 const scan=scanFootnotes(blocks);
 const map=new Map<number,number>();let next=1,changed=false;
 for(const r of scan.refs){
  if(!map.has(r.num))map.set(r.num,next++);
  if(map.get(r.num)!==r.num)changed=true;
 }
 for(const n of scan.notes)if(map.has(n.num)&&map.get(n.num)!==n.num)changed=true;
 if(!changed||!map.size)return [];
 const edits=new Map<number,NoteHunk[]>();
 const push=(block:number,hunk:NoteHunk)=>{const l=edits.get(block)??[];l.push(hunk);edits.set(block,l);};
 for(const b of paras(blocks)){
  const n=footnoteNoteNum(b.text!);
  if(n!==null){const to=map.get(n);if(to!==undefined&&to!==n){const m=NOTE_RE.exec(b.text!)!;push(b.index,{start:toBytes(b.text!,2),end:toBytes(b.text!,2+String(n).length),text:String(to)});}continue;}
  for(const r of footnoteRefsIn(b.text!)){
   const to=map.get(r.num);if(to===undefined||to===r.num)continue;
   push(b.index,{start:toBytes(b.text!,r.start+2),end:toBytes(b.text!,r.start+2+String(r.num).length),text:String(to)});
  }
 }
 return [...edits].map(([block,hunks])=>({block,hunks:hunks.sort((a,b)=>a.start-b.start)})).filter(e=>e.hunks.length);
}

/** The figure number when a paragraph is a figure caption (`Figure n: ...`), else null. */
export function figureCaptionNum(text:string):number|null{const m=FIGURE_RE.exec(text);return m?Number(m[1]):null;}

/** All figure captions in document order. */
export function scanFigures(blocks:readonly NoteBlock[]):{block:number;num:number}[]{
 const out:{block:number;num:number}[]=[];
 for(const b of paras(blocks)){const n=figureCaptionNum(b.text!);if(n!==null)out.push({block:b.index,num:n});}
 return out;
}

/** The number the next figure caption gets (one past the highest in the document). */
export function nextFigureNumber(blocks:readonly NoteBlock[]):number{
 const s=scanFigures(blocks);return Math.min(s.reduce((m,x)=>Math.max(m,x.num),0)+1,MAX_FIGURES+1);
}

/** Renumbers every figure caption from 1 in document order. Empty when already in order. */
export function planFigureRenumber(blocks:readonly NoteBlock[]):NoteEdit[]{
 const caps=scanFigures(blocks);
 if(!caps.length||caps.every((c,i)=>c.num===i+1))return [];
 const out:NoteEdit[]=[];
 caps.forEach((c,i)=>{
  if(c.num===i+1)return;
  const text=paras(blocks).find(b=>b.index===c.block)!.text!;
  out.push({block:c.block,hunks:[{start:toBytes(text,7),end:toBytes(text,7+String(c.num).length),text:String(i+1)}]});
 });
 return out;
}
