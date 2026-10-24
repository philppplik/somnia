export type SelectUnit='word'|'sentence'|'paragraph';
const has=typeof Intl!=='undefined'&&'Segmenter' in Intl;
function segments(text:string,g:'word'|'sentence'):{start:number;end:number;word:boolean}[]{
 if(has){const out=[];for(const s of new Intl.Segmenter(undefined,{granularity:g}).segment(text))out.push({start:s.index,end:s.index+s.segment.length,word:!!s.isWordLike||/\p{Extended_Pictographic}/u.test(s.segment)});return out;}
 const re=g==='word'?/[\p{L}\p{N}\p{M}_']+|\s+|[^\p{L}\p{N}\p{M}_'\s]+/gu:/[^.!?]*[.!?]*\s*/gu;
 return [...text.matchAll(re)].filter(m=>m[0]!=='').map(m=>({start:m.index!,end:m.index!+m[0].length,word:g==='word'&&/^[\p{L}\p{N}\p{M}_'\p{Extended_Pictographic}]/u.test(m[0])}));
}
/**
 * The UTF-16 range a double click (word, plus the spaces after it), a sentence selection (with its trailing spaces) or a triple click
 * (the whole paragraph) takes around index `i`. An empty text gives [0,0].
 */
export function unitRange(text:string,i:number,unit:SelectUnit):[number,number]{
 if(text==='')return [0,0];
 if(unit==='paragraph')return [0,text.length];
 const at=Math.min(Math.max(i,0),text.length-1);
 const segs=segments(text,unit);const s=segs.find(x=>at>=x.start&&at<x.end);if(!s)return [0,text.length];
 if(unit==='sentence')return [s.start,s.end];
 let end=s.end;
 if(s.word){const sp=/^[ \t]+/.exec(text.slice(end));if(sp)end+=sp[0].length;}
 return [s.start,end];
}
