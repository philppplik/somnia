import type {NameInfo,NameOp} from './protocol';
/** Defined names: validation of untrusted command input and of the bridge answer. The Rust bridge re-validates. */
export const MAX_NAME_CHARS=64,MAX_NAMES=500;
export const MAX_COMMENT_CHARS=255;
const textOk=(v:unknown,max:number,empty:boolean)=>typeof v==='string'&&(empty||v!=='')&&[...v].length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
/** What the constant box means: a number when it reads as one, otherwise text. */
export function constantValue(raw:string):number|string{const t=raw.trim();return t!==''&&Number.isFinite(Number(t))?Number(t):raw;}
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
 if(o.kind==='fromSelection'){only('kind','top','left','replace');for(const k of ['top','left','replace'])if(o[k]!==undefined&&typeof o[k]!=='boolean')throw Error('`'+k+'` must be true or false.');if(o.top!==true&&o.left!==true)throw Error('Choose the top row or the left column.');return {kind:'fromSelection',...(o.top===true?{top:true}:{}),...(o.left===true?{left:true}:{}),...(o.replace===true?{replace:true}:{})};}
 if(typeof o.name!=='string')throw Error('A name is needed.');const name=o.name.trim();
 const scope=o.scope===undefined?'workbook':o.scope;if(scope!=='workbook'&&scope!=='sheet')throw Error('Scope must be workbook or sheet.');
 if(o.kind==='define'){only('kind','name','scope','replace');if(nameProblem(name))throw Error('Invalid name.');if(o.replace!==undefined&&typeof o.replace!=='boolean')throw Error('replace must be true or false.');const out:NameOp={kind:'define',name,scope};if(o.replace)out.replace=true;return out;}
 if(o.kind==='delete'){only('kind','name','scope');if(name===''||[...name].length>MAX_NAME_CHARS)throw Error('Invalid name.');return {kind:'delete',name,scope};}
 if(o.kind==='comment'){only('kind','name','scope','text');if(name===''||[...name].length>MAX_NAME_CHARS)throw Error('Invalid name.');if(!textOk(o.text,MAX_COMMENT_CHARS,true))throw Error('A comment has at most 255 characters and no control characters.');return {kind:'comment',name,scope,text:o.text as string};}
 if(o.kind==='constant'){only('kind','name','scope','value','replace');if(nameProblem(name))throw Error('Invalid name.');if(o.replace!==undefined&&typeof o.replace!=='boolean')throw Error('replace must be true or false.');const v=o.value;if(!((typeof v==='number'&&Number.isFinite(v))||textOk(v,MAX_COMMENT_CHARS,false)))throw Error('A constant is a number or a text of 1 to 255 characters.');return {kind:'constant',name,scope,value:v as number|string,...(o.replace===true?{replace:true}:{})};}
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
/** Where a typed defined name leads: the first cell of what it refers to. A name of the active sheet wins over a workbook name of the same spelling.
 *  null for unknown names, names that are not a plain place (constants, formulas) and places on hidden or missing sheets. */
export function resolveNameJump(input:string,names:readonly NameInfo[],sheets:readonly {name:string;index:number;visibility:string}[],activeSheetName:string):{sheet:number;address:string}|null{
 const want=input.trim().toLowerCase();if(want===''||[...want].length>MAX_NAME_CHARS)return null;
 const hits=names.filter(n=>n.name.toLowerCase()===want&&(n.scope==='Workbook'||n.scope===activeSheetName));
 const hit=hits.find(n=>n.scope!=='Workbook')??hits[0];if(!hit)return null;
 const target=nameTarget(hit.refersTo);if(!target)return null;
 const dest=sheets.find(x=>x.name.toLowerCase()===target.sheet.toLowerCase()&&x.visibility==='Visible');
 return dest?{sheet:dest.index,address:target.address}:null;
}
