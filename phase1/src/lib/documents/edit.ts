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
/** UTF-8 offset just after the last inserted text once `edit` has been applied. */
export function caretAfterEdit(edit:TextEdit):number{
 let delta=0,pos=0;for(const h of edit.hunks){pos=h.start+delta+bytes(h.text);delta+=bytes(h.text)-(h.end-h.start);}return pos;
}
/** Host-side undo: one entry per applied edit holding the inverse edit. */
/** Structural step (split/merge, or a replacement plus split): undone by restoring engine snapshots. */
export interface SnapStep{before:number;after:number;caretBefore:{block:number;off:number};caretAfter:{block:number;off:number}}
export interface UndoEntry{inverse:TextEdit;snap?:SnapStep}
export class UndoStack{
 private undoS:UndoEntry[]=[];private redoS:UndoEntry[]=[];
 get canUndo(){return this.undoS.length>0;}get canRedo(){return this.redoS.length>0;}
 private mergeAt=-Infinity;
 /** `merge`: consecutive typing in one place within `windowMs` becomes one undo step. */
 push(inverse:TextEdit,merge=false,now=Date.now(),windowMs=1200){
  const top=this.undoS[this.undoS.length-1];const h=inverse.hunks[0];
  if(merge&&top&&!top.snap&&now-this.mergeAt<=windowMs&&top.inverse.block===inverse.block&&top.inverse.hunks.length===1&&inverse.hunks.length===1&&h.text===''&&h.start===top.inverse.hunks[0].end){
   const t=top.inverse.hunks[0];this.undoS[this.undoS.length-1]={inverse:{block:inverse.block,hunks:[{start:t.start,end:h.end,text:t.text}]}};this.mergeAt=now;this.redoS=[];return;
  }
  this.undoS.push({inverse});this.redoS=[];this.mergeAt=merge?now:-Infinity;
 }
 popUndo(){this.mergeAt=-Infinity;return this.undoS.pop();}popRedo(){return this.redoS.pop();}
 pushRedo(inverse:TextEdit){this.redoS.push({inverse});}pushUndo(inverse:TextEdit){this.undoS.push({inverse});}
 pushSnap(snap:SnapStep){this.undoS.push({inverse:{block:snap.caretBefore.block,hunks:[]},snap});this.redoS=[];this.mergeAt=-Infinity;}
 pushRedoEntry(x:UndoEntry){this.redoS.push(x);}pushUndoEntry(x:UndoEntry){this.undoS.push(x);}
 clear(){this.undoS=[];this.redoS=[];}
}
