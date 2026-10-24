import {uid} from './model';
import type {InterfaceComment,InterfaceDocument} from './schema';
import {MAX_COMMENT_TEXT,MAX_INTERFACE_COMMENTS} from './commentsCore';
export interface CommentEntry extends InterfaceComment {layerName:string;pageId:string;missing:boolean;}
/** Every mutation is one caller transaction, so one undo restores the previous comment state. */
export function addInterfaceComment(doc:InterfaceDocument,nodeId:string,text:string):string{
 const node=doc.nodes.find(n=>n.id===nodeId),body=text.trim();
 if(!node)throw Error('Select a layer to comment on.');
 if(!body||body.length>MAX_COMMENT_TEXT)throw Error(`Enter a comment up to ${MAX_COMMENT_TEXT} characters.`);
 if((doc.comments??[]).length>=MAX_INTERFACE_COMMENTS)throw Error('Comment limit reached.');
 const id=uid();(doc.comments??=[]).push({id,nodeId,text:body,createdAt:Date.now()});return id;
}
export function setInterfaceCommentResolved(doc:InterfaceDocument,id:string,resolved:boolean):void{
 const c=doc.comments?.find(c=>c.id===id);if(!c)throw Error('Comment unavailable.');
 if(resolved)c.resolved=true;else delete c.resolved;
}
export function removeInterfaceComment(doc:InterfaceDocument,id:string):void{
 const index=(doc.comments??[]).findIndex(c=>c.id===id);if(index<0)throw Error('Comment unavailable.');
 doc.comments!.splice(index,1);if(!doc.comments!.length)delete doc.comments;
}
/** Display helper over the live document: newest first, layer names resolved, dangling comments marked. */
export function interfaceComments(doc:InterfaceDocument,filter:'open'|'resolved'|'all'='all'):CommentEntry[]{
 return (doc.comments??[]).filter(c=>filter==='all'||(filter==='resolved')===!!c.resolved)
  .map(c=>{const node=doc.nodes.find(n=>n.id===c.nodeId);return {...c,layerName:node?.name??'',pageId:node?.pageId??'',missing:!node};})
  .sort((a,b)=>b.createdAt-a.createdAt);
}
