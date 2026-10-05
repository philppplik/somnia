import type * as Y from 'yjs';
/** Smallest single replacement that turns `a` into `b` (common prefix and suffix kept). Never splits a surrogate pair. */
export function minimalEdit(a:string,b:string):{from:number;remove:number;insert:string}|null{
 if(a===b)return null;
 let from=0;const max=Math.min(a.length,b.length);
 while(from<max&&a.charCodeAt(from)===b.charCodeAt(from))from++;
 let ea=a.length,eb=b.length;
 while(ea>from&&eb>from&&a.charCodeAt(ea-1)===b.charCodeAt(eb-1)){ea--;eb--;}
 const hi=(c:number)=>c>=0xd800&&c<=0xdbff,lo=(c:number)=>c>=0xdc00&&c<=0xdfff;
 if(from>0&&hi(a.charCodeAt(from-1))&&(lo(a.charCodeAt(from))||lo(b.charCodeAt(from))))from--;
 if(ea<a.length&&lo(a.charCodeAt(ea))&&hi(a.charCodeAt(ea-1))){ea++;eb++;}
 return{from,remove:ea-from,insert:b.slice(from,eb)};
}
/** Design view and other non-editor edits arrive as whole-file text. Apply them as one small change so other people's edits elsewhere in the file are not overwritten. */
export function applyTextToYText(ytext:Y.Text,next:string,origin:unknown='design'):boolean{
 const e=minimalEdit(ytext.toString(),next);if(!e)return false;
 const run=()=>{if(e.remove)ytext.delete(e.from,e.remove);if(e.insert)ytext.insert(e.from,e.insert);};
 if(ytext.doc)ytext.doc.transact(run,origin);else run();
 return true;
}
