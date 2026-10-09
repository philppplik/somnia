import {utf16ToUtf8Offset} from './text';
export interface DocBlock{index:number;kind:'para'|'table';text?:string;editable:boolean}
export interface TextEdit{block:number;utf8Start:number;utf8End:number;text:string}
/** Smallest single replacement that turns `before` into `after` (common prefix and suffix, never splitting a surrogate pair). */
export function diffEdit(block:number,before:string,after:string):TextEdit|null{
 if(before===after)return null;
 let a=0;const max=Math.min(before.length,after.length);
 while(a<max&&before.charCodeAt(a)===after.charCodeAt(a))a++;
 let b=0;
 while(b<max-a&&before.charCodeAt(before.length-1-b)===after.charCodeAt(after.length-1-b))b++;
 const hi=(c:number)=>c>=0xd800&&c<=0xdbff,lo=(c:number)=>c>=0xdc00&&c<=0xdfff;
 if(a>0&&a<before.length&&hi(before.charCodeAt(a-1))&&lo(before.charCodeAt(a)))a--;
 else if(a>0&&a<after.length&&hi(after.charCodeAt(a-1))&&lo(after.charCodeAt(a)))a--;
 const endB=before.length-b,endA=after.length-b;
 if(endB<before.length&&lo(before.charCodeAt(endB))&&hi(before.charCodeAt(endB-1)))b--;
 const eB=before.length-b,eA=after.length-b;
 return{block,utf8Start:utf16ToUtf8Offset(before,a),utf8End:utf16ToUtf8Offset(before,eB),text:after.slice(a,eA)};
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
/** The edit that reverses `edit` when applied to the text it produced. */
export function inverseOf(before:string,edit:TextEdit):TextEdit{
 const enc=new TextEncoder();const removed=new TextDecoder().decode(enc.encode(before).slice(edit.utf8Start,edit.utf8End));
 return{block:edit.block,utf8Start:edit.utf8Start,utf8End:edit.utf8Start+enc.encode(edit.text).length,text:removed};
}
