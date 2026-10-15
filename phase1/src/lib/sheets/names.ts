import type {NameInfo,NameOp} from './protocol';
/** Defined names: validation of untrusted command input and of the bridge answer. The Rust bridge re-validates. */
export const MAX_NAME_CHARS=64,MAX_NAMES=500;
const rc=(l:string)=>/^r[0-9]*c[0-9]*$/.test(l);
const cellLike=(n:string)=>/^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}$/.test(n);
/** null when the name is fine; otherwise why not. */
export function nameProblem(name:string):'length'|'chars'|'cell'|null{
 const n=[...name];if(n.length===0||n.length>MAX_NAME_CHARS)return 'length';
 if(!/^[\p{L}_][\p{L}\p{N}_.]*$/u.test(name))return 'chars';
 const l=name.toLowerCase();if(l==='r'||l==='c'||rc(l)||cellLike(name))return 'cell';return null;
}
export function parseNamesCommand(input:unknown):NameOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Name operation must be an object.');
 const o=input as Record<string,unknown>,only=(...k:string[])=>{if(Object.keys(o).some(x=>!k.includes(x)))throw Error('Unknown name field.');};
 if(typeof o.name!=='string')throw Error('A name is needed.');const name=o.name.trim();
 const scope=o.scope===undefined?'workbook':o.scope;if(scope!=='workbook'&&scope!=='sheet')throw Error('Scope must be workbook or sheet.');
 if(o.kind==='define'){only('kind','name','scope','replace');if(nameProblem(name))throw Error('Invalid name.');if(o.replace!==undefined&&typeof o.replace!=='boolean')throw Error('replace must be true or false.');const out:NameOp={kind:'define',name,scope};if(o.replace)out.replace=true;return out;}
 if(o.kind==='delete'){only('kind','name','scope');if(name===''||[...name].length>MAX_NAME_CHARS)throw Error('Invalid name.');return {kind:'delete',name,scope};}
 throw Error('Unsupported name operation.');
}
export function parseNames(raw:{names:unknown}):NameInfo[]{
 if(!Array.isArray(raw.names))return [];const out:NameInfo[]=[];
 for(const n of raw.names.slice(0,MAX_NAMES)){const r=n as Record<string,unknown>|null;if(r&&typeof r.name==='string'&&typeof r.refersTo==='string')out.push({name:r.name,refersTo:r.refersTo,scope:typeof r.scope==='string'?r.scope:'Workbook',comment:typeof r.comment==='string'?r.comment:''});}
 return out;
}
/** "=Sheet 1!$B$2:$C$3" -> sheet name and first cell; null for formulas that are not a plain place. */
export function nameTarget(refersTo:string):{sheet:string;address:string}|null{
 const m=/^=?(?:'((?:[^']|'')+)'|([^'!]+))!\$?([A-Za-z]{1,3})\$?([0-9]{1,7})(?::\$?[A-Za-z]{1,3}\$?[0-9]{1,7})?$/.exec(refersTo);if(!m)return null;
 return {sheet:(m[1]??m[2]).replace(/''/g,"'"),address:(m[3]+m[4]).toUpperCase()};
}
