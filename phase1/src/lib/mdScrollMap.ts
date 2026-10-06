/** Block based scroll mapping between Markdown source lines and rendered blocks. Pure functions so they can be tested without a DOM. */
export interface MapBlock{start:number;end:number;top:number;height:number}
/** Innermost block containing a fractional zero-based source line, or the previous block for blank lines. */
function blockForLine(blocks:MapBlock[],line:number):{b:MapBlock;after:boolean}|null{
 let best:MapBlock|null=null;for(const b of blocks)if(b.start<=line&&line<b.end&&(!best||b.start>best.start||(b.start===best.start&&b.end-b.start<best.end-best.start)))best=b;
 if(best)return {b:best,after:false};
 let prev:MapBlock|null=null;for(const b of blocks)if(b.end<=line&&(!prev||b.end>prev.end||(b.end===prev.end&&b.start>prev.start)))prev=b;
 return prev?{b:prev,after:true}:null;}
/** Preview scrollTop for a fractional source line (line + position inside that line). */
export function lineToPreviewTop(blocks:MapBlock[],line:number):number{
 if(!blocks.length)return 0;const hit=blockForLine(blocks,line);
 if(!hit){const first=blocks.reduce((a,b)=>b.top<a.top?b:a);return first.top;}
 const {b,after}=hit;if(after)return b.top+b.height;
 const span=Math.max(1,b.end-b.start);return b.top+Math.min(1,Math.max(0,(line-b.start)/span))*b.height;}
/** Fractional source line for a preview scrollTop. */
export function previewTopToLine(blocks:MapBlock[],top:number):number{
 if(!blocks.length)return 0;let best:MapBlock|null=null;
 for(const b of blocks)if(b.top<=top&&top<b.top+Math.max(1,b.height)&&(!best||b.start>best.start||(b.start===best.start&&b.height<best.height)))best=b;
 if(!best){const above=blocks.filter(b=>b.top+b.height<=top);if(!above.length)return Math.min(...blocks.map(b=>b.start));const p=above.reduce((a,b)=>b.top+b.height>a.top+a.height?b:a);return p.end;}
 const f=Math.min(1,Math.max(0,(top-best.top)/Math.max(1,best.height)));return best.start+f*(best.end-best.start);}
/** True when a scroller sits at its bottom edge (within 2px). */
export const atBottom=(top:number,client:number,total:number)=>total>client&&top+client>=total-2;
