import type {ReplaceOp} from './protocol';
/** Find and replace: validation for untrusted command input. The Rust bridge re-validates every field. */
export const MAX_REPLACE_TEXT=255,MAX_REPLACE_CELLS=1_000_000;
const bad=(t:string,min:number)=>[...t].length<min||[...t].length>MAX_REPLACE_TEXT||/[\u0000-\u001f\u007f]/.test(t);
export const replaceProblem=(what:string,to:string):'what'|'with'|null=>bad(what,1)?'what':bad(to,0)?'with':null;
export function parseReplaceCommand(input:unknown):ReplaceOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Replace must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>!['what','with','matchCase','wholeCell','inFormulas'].includes(k)))throw Error('Unknown replace field.');
 if(typeof o.what!=='string'||typeof o.with!=='string'||replaceProblem(o.what,o.with))throw Error('Invalid replace text.');
 for(const k of ['matchCase','wholeCell','inFormulas'])if(typeof o[k]!=='boolean')throw Error(`${k} must be true or false.`);
 return {what:o.what,with:o.with,matchCase:o.matchCase as boolean,wholeCell:o.wholeCell as boolean,inFormulas:o.inFormulas as boolean};
}
