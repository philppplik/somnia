/** The engine counts UTF-8 bytes; JavaScript carets count UTF-16 units. Convert at the boundary only. */
export function utf16ToUtf8Offset(text:string,utf16:number):number{
 if(!Number.isInteger(utf16)||utf16<0||utf16>text.length)throw new RangeError('Caret is outside the text.');
 const c=text.charCodeAt(utf16);const prev=utf16>0?text.charCodeAt(utf16-1):0;
 if(utf16>0&&utf16<text.length&&prev>=0xd800&&prev<=0xdbff&&c>=0xdc00&&c<=0xdfff)throw new RangeError('Caret splits a surrogate pair.');
 return new TextEncoder().encode(text.slice(0,utf16)).length;
}
/** Splits the engine's body text into paragraphs (it joins blocks with newlines). */
export const paragraphs=(text:string)=>text.split('\n');
/** Inverse of utf16ToUtf8Offset. Offsets inside a multi-byte character are refused, never rounded. */
export function utf8ToUtf16Offset(text:string,utf8:number):number{
 let b=0,i=0;
 while(b<utf8&&i<text.length){const cp=text.codePointAt(i)!;b+=cp<0x80?1:cp<0x800?2:cp<0x10000?3:4;i+=cp>0xffff?2:1;}
 if(b!==utf8)throw new RangeError('Offset is not a character boundary.');
 return i;
}
const seg=typeof Intl!=='undefined'&&'Segmenter' in Intl?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
/** UTF-16 index of the previous/next user-perceived character boundary (grapheme cluster when available). */
export function stepBoundary(text:string,i:number,dir:-1|1):number{
 if(dir<0&&i<=0)return 0;if(dir>0&&i>=text.length)return text.length;
 if(seg){const bs=[0];for(const g of seg.segment(text))bs.push(g.index+g.segment.length);return dir>0?(bs.find(x=>x>i)??text.length):([...bs].reverse().find(x=>x<i)??0);}
 let j=i+dir;const hi=(k:number)=>{const c=text.charCodeAt(k);return c>=0xd800&&c<=0xdbff;},lo=(k:number)=>{const c=text.charCodeAt(k);return c>=0xdc00&&c<=0xdfff;};
 if(dir<0&&j>0&&lo(j)&&hi(j-1))j--;if(dir>0&&j<text.length&&lo(j)&&hi(j-1))j++;return j;
}
const wseg=typeof Intl!=='undefined'&&'Segmenter' in Intl?new Intl.Segmenter(undefined,{granularity:'word'}):null;
/** Start offsets (UTF-16) of every word-like run: letters, digits, ideographs and emoji count; spaces and punctuation do not. */
function wordStarts(text:string):number[]{
 const out:number[]=[];
 if(wseg){for(const s of wseg.segment(text))if(s.isWordLike||/\p{Extended_Pictographic}/u.test(s.segment))out.push(s.index);return out;}
 const re=/[\p{L}\p{N}\p{M}\p{Extended_Pictographic}]+/gu;for(const m of text.matchAll(re))out.push(m.index!);return out;
}
/** UTF-16 index a Ctrl+Arrow move lands on: forward to the start of the next word (or the end), backward to the start of the current or previous word (or 0). Same index means the paragraph edge. */
export function wordBoundary(text:string,i:number,dir:-1|1):number{
 const starts=wordStarts(text);
 if(dir>0){if(i>=text.length)return text.length;return starts.find(s=>s>i)??text.length;}
 if(i<=0)return 0;for(let k=starts.length-1;k>=0;k--)if(starts[k]<i)return starts[k];return 0;
}
