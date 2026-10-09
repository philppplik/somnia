export interface DocBlock{index:number;kind:'para'|'table';text?:string;editable:boolean}
/** One replacement in UTF-8 byte offsets of the paragraph text it applies to. */
export interface Hunk{start:number;end:number;text:string}
/** All hunks of one paragraph, ascending and non-overlapping, applied atomically. */
export interface TextEdit{block:number;hunks:Hunk[]}
const enc=new TextEncoder();
const bytes=(s:string)=>enc.encode(s).length;
const MAX_CELLS=4_000_000;
/** Code-point level diff: common prefix/suffix, then LCS inside the changed middle. Falls back to one hunk for very large middles. */
export function diffEdit(block:number,before:string,after:string):TextEdit|null{
 if(before===after)return null;
 const a=Array.from(before),b=Array.from(after);
 let p=0;while(p<a.length&&p<b.length&&a[p]===b[p])p++;
 let q=0;while(q<a.length-p&&q<b.length-p&&a[a.length-1-q]===b[b.length-1-q])q++;
 const am=a.slice(p,a.length-q),bm=b.slice(p,b.length-q);
 const ops:{aFrom:number;aTo:number;text:string}[]=[];
 if(am.length*bm.length>MAX_CELLS||am.length===0||bm.length===0){ops.push({aFrom:p,aTo:p+am.length,text:bm.join('')});}
 else{
  const n=am.length,m=bm.length,w=m+1;const dp=new Uint32Array((n+1)*w);
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i*w+j]=am[i]===bm[j]?dp[(i+1)*w+j+1]+1:Math.max(dp[(i+1)*w+j],dp[i*w+j+1]);
  let i=0,j=0,cur:{aFrom:number;aTo:number;text:string}|null=null;
  const flush=()=>{if(cur){ops.push(cur);cur=null;}};
  while(i<n||j<m){
   if(i<n&&j<m&&am[i]===bm[j]){flush();i++;j++;continue;}
   if(!cur)cur={aFrom:p+i,aTo:p+i,text:''};
   if(j<m&&(i>=n||dp[i*w+j+1]>=dp[(i+1)*w+j])){cur.text+=bm[j];j++;}else{i++;cur.aTo=p+i;}
  }
  flush();
 }
 // code-point indexes -> UTF-8 byte offsets of `before`
 const off=[0];for(const ch of a)off.push(off[off.length-1]+bytes(ch));
 return{block,hunks:ops.map(o=>({start:off[o.aFrom],end:off[o.aTo],text:o.text}))};
}
/** Applies an edit to a string the same way the engine does (reference implementation for tests and undo). */
export function applyEdit(before:string,edit:TextEdit):string{
 const buf=enc.encode(before);const dec=new TextDecoder();let out='',pos=0;
 for(const h of edit.hunks){out+=dec.decode(buf.slice(pos,h.start))+h.text;pos=h.end;}
 return out+dec.decode(buf.slice(pos));
}
/** The edit that reverses `edit` when applied to the text it produced. */
export function inverseOf(before:string,edit:TextEdit):TextEdit{
 const buf=enc.encode(before);const dec=new TextDecoder();let delta=0;const hunks:Hunk[]=[];
 for(const h of edit.hunks){
  const s=h.start+delta;const len=bytes(h.text);
  hunks.push({start:s,end:s+len,text:dec.decode(buf.slice(h.start,h.end))});
  delta+=len-(h.end-h.start);
 }
 return{block:edit.block,hunks};
}
/** Host-side undo: one entry per applied edit holding the inverse edit. */
export interface UndoEntry{inverse:TextEdit}
export class UndoStack{
 private undoS:UndoEntry[]=[];private redoS:UndoEntry[]=[];
 get canUndo(){return this.undoS.length>0;}get canRedo(){return this.redoS.length>0;}
 push(inverse:TextEdit){this.undoS.push({inverse});this.redoS=[];}
 popUndo(){return this.undoS.pop();}popRedo(){return this.redoS.pop();}
 pushRedo(inverse:TextEdit){this.redoS.push({inverse});}pushUndo(inverse:TextEdit){this.undoS.push({inverse});}
 clear(){this.undoS=[];this.redoS=[];}
}
