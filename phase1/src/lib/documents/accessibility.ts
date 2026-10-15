import type {DocBlock} from './edit';
export type A11yKind='noAlt'|'emptyHeading'|'headingSkip'|'blankRun'|'noHeadings';
export interface A11yIssue{kind:A11yKind;/** Paragraph to go to (-1 for the whole document). */block:number;/** For a skipped heading level: the level found and the level before it (1 to 9). */level?:number;from?:number;quote?:string}
/** A long document without any heading is hard to move through with a screen reader. */
export const LONG_DOC_WORDS=500;
/** Blank paragraphs in a row that count as spacing made with the Enter key. */
export const BLANK_RUN=3;
const quote=(t:string|undefined)=>{const s=(t??'').replace(/\s+/g,' ').trim();const a=Array.from(s);return a.length>60?a.slice(0,57).join('')+'...':s;};
/**
 * Checks top-level paragraphs for what makes a document hard to use with a screen reader: pictures without alt text, empty headings, skipped heading
 * levels (a level 3 right after a level 1), runs of three or more blank paragraphs and a long document with no heading. At most `limit` issues, in document order.
 */
export function checkAccessibility(blocks:readonly DocBlock[],words:number,limit=200):A11yIssue[]{
 const out:A11yIssue[]=[];const add=(i:A11yIssue)=>{if(out.length<limit)out.push(i);};
 let prev:number|null=null,run=0,runStart=-1,headings=0;
 const flush=()=>{if(run>=BLANK_RUN)add({kind:'blankRun',block:runStart});run=0;runStart=-1;};
 for(const b of blocks){
  if(b.kind!=='para'){flush();continue;}
  const blank=!b.image&&(b.text??'').trim()===''&&!b.sectionBreak&&b.editable&&(b.outline===null||b.outline===undefined);
  if(blank){if(run===0)runStart=b.index;run++;}else flush();
  if(b.image&&b.image.alt.trim()==='')add({kind:'noAlt',block:b.index});
  if(b.outline!==null&&b.outline!==undefined&&!b.image){
   headings++;const level=b.outline+1;
   if((b.text??'').trim()==='')add({kind:'emptyHeading',block:b.index,level});
   if(prev!==null&&level>prev+1)add({kind:'headingSkip',block:b.index,level,from:prev,quote:quote(b.text)});
   prev=level;
  }
 }
 flush();
 if(headings===0&&words>=LONG_DOC_WORDS)add({kind:'noHeadings',block:-1});
 return out.sort((a,b)=>a.block-b.block);
}
