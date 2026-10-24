import type {InterfaceDocument} from './schema';
export const MAX_INTERFACE_COMMENTS=500,MAX_COMMENT_TEXT=2000;
/** Comments tolerate dangling node ids (layers can be deleted after review); text and count stay bounded. */
export function validateInterfaceComments(doc:InterfaceDocument):void{
 if(doc.comments===undefined)return;
 if(!Array.isArray(doc.comments)||doc.comments.length>MAX_INTERFACE_COMMENTS)throw Error('Invalid comments.');
 const seen=new Set<string>();
 for(const c of doc.comments){
  if(!c||typeof c!=='object'||typeof c.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(c.id)||seen.has(c.id)||typeof c.nodeId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(c.nodeId)||typeof c.text!=='string'||!c.text.trim().length||c.text.length>MAX_COMMENT_TEXT||typeof c.createdAt!=='number'||!Number.isFinite(c.createdAt)||c.createdAt<0||(c.resolved!==undefined&&typeof c.resolved!=='boolean'))throw Error('Invalid comment.');
  seen.add(c.id);
 }
}
