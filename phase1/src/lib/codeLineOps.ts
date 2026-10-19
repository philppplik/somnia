/**
 * Line operations for the Code studio editor: sort, remove duplicates, trim trailing whitespace, join, and case.
 * Pure text functions plus one editor adapter. They act on the whole lines touched by the selection, or on the
 * whole file when nothing is selected (case changes act on the exact selection only). One CodeMirror transaction
 * per command, so one undo step.
 */
import type {EditorView} from '@codemirror/view';
export type LineOp='sortAsc'|'sortDesc'|'unique'|'trim'|'join'|'upper'|'lower';
export const LINE_OPS:readonly LineOp[]=['sortAsc','sortDesc','unique','trim','join','upper','lower'];
const cmp=(a:string,b:string)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'})||(a<b?-1:a>b?1:0);
/** Applies an operation to text. Newlines are kept as the input used them (CRLF stays CRLF). */
export function applyLineOp(text:string,op:LineOp):string{
 if(op==='upper')return text.toUpperCase();
 if(op==='lower')return text.toLowerCase();
 const eol=text.includes('\r\n')?'\r\n':'\n';
 const trailing=text.endsWith(eol);
 const lines=(trailing?text.slice(0,-eol.length):text).split(/\r?\n/);
 let out:string[];
 switch(op){
  case 'sortAsc':out=[...lines].sort(cmp);break;
  case 'sortDesc':out=[...lines].sort((a,b)=>cmp(b,a));break;
  case 'unique':{const seen=new Set<string>();out=lines.filter(l=>{if(seen.has(l))return false;seen.add(l);return true;});break;}
  case 'trim':out=lines.map(l=>l.replace(/[ \t]+$/,''));break;
  case 'join':out=[lines.map((l,i)=>i===0?l.replace(/\s+$/,''):l.trim()).filter((l,i)=>i===0||l.length>0).join(' ')];break;
 }
 return out.join(eol)+(trailing?eol:'');
}
/** Range the operation covers: whole lines touched by the selection, the whole file when empty, the exact selection for case. */
export function opRange(view:EditorView,op:LineOp):{from:number;to:number}{
 const {doc,selection}=view.state,r=selection.main;
 if(op==='upper'||op==='lower')return r.empty?{from:0,to:0}:{from:r.from,to:r.to};
 if(r.empty)return {from:0,to:doc.length};
 const a=doc.lineAt(r.from),b=doc.lineAt(r.to>r.from&&doc.lineAt(r.to).from===r.to?r.to-1:r.to);
 return {from:a.from,to:Math.min(doc.length,b.to+(b.to<doc.length?1:0))};
}
/** Runs the operation in the editor. Returns false when there is nothing to do (read-only, empty range, no change). */
export function runLineOp(view:EditorView,op:LineOp):boolean{
 if(view.state.readOnly)return false;
 const {from,to}=opRange(view,op);
 if(from===to)return false;
 const src=view.state.sliceDoc(from,to),next=applyLineOp(src,op);
 if(next===src)return false;
 view.dispatch({changes:{from,to,insert:next},selection:{anchor:from,head:from+next.length},userEvent:'input.lineop'});
 return true;
}
