import {COMMENT_AUTHOR} from './protocol';
/** The name Documents records as the author of new comments and as last-modified-by in saved copies. Stored on this device only. */
export const AUTHOR_KEY='somnia.documents.author';
export const MAX_AUTHOR_CHARS=60;
/** Why a name is refused (too long, control characters), or null when it is fine. An empty name is allowed and means the default. */
export function authorProblem(name:unknown):string|null{
 if(typeof name!=='string')return 'The name must be text.';
 const t=name.trim();
 if(Array.from(t).length>MAX_AUTHOR_CHARS)return `A name is limited to ${MAX_AUTHOR_CHARS} characters.`;
 if(/[\u0000-\u001f\u007f-\u009f]/.test(t))return 'The name has characters that are not allowed.';
 return null;
}
const store=():Storage|null=>{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}};
/** The saved name, or an empty string when none is set (or the stored value is not valid). */
export function savedAuthor():string{
 try{const v=store()?.getItem(AUTHOR_KEY)??'';return authorProblem(v)===null?v.trim():'';}catch{return '';}
}
/** Saves the name (empty clears it). Returns false when the name is refused or storage is unavailable. */
export function setAuthor(name:string):boolean{
 if(authorProblem(name)!==null)return false;
 try{const s=store();if(!s)return false;const t=name.trim();if(t)s.setItem(AUTHOR_KEY,t);else s.removeItem(AUTHOR_KEY);return true;}catch{return false;}
}
/** The author for a new comment: the saved name, else the default. */
export const commentAuthor=()=>savedAuthor()||COMMENT_AUTHOR;
