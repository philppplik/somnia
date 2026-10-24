/**
 * `when` expressions: a tiny fixed grammar, no eval, no function calls.
 *   expr   := or
 *   or     := and ('||' and)*
 *   and    := not ('&&' not)*
 *   not    := '!' not | cmp
 *   cmp    := atom (('=='|'!='|'<'|'<='|'>'|'>=') atom)?
 *   atom   := number | 'string' | "string" | true | false | null | path | '(' expr ')'
 *   path   := ident ('.' ident)*      (read from the context object)
 * Missing paths are undefined (falsy). Ordering comparisons with a non-number are false.
 * Menu, toolbar, palette and shortcut all evaluate the same string.
 */
export class WhenSyntaxError extends Error {constructor(message:string,readonly pos:number){super(`when: ${message} at ${pos}`);this.name='WhenSyntaxError';}}
type Tok={t:'num'|'str'|'id'|'op';v:string;pos:number};
const OPS=['&&','||','==','!=','<=','>=','<','>','!','(',')','.'];
function lex(src:string):Tok[]{
 const out:Tok[]=[];let i=0;
 while(i<src.length){
  const c=src[i];
  if(/\s/.test(c)){i++;continue;}
  if(/[0-9]/.test(c)){let j=i;while(j<src.length&&/[0-9.]/.test(src[j]))j++;out.push({t:'num',v:src.slice(i,j),pos:i});i=j;continue;}
  if(c==="'"||c==='"'){let j=i+1;while(j<src.length&&src[j]!==c)j++;if(j>=src.length)throw new WhenSyntaxError('unterminated string',i);out.push({t:'str',v:src.slice(i+1,j),pos:i});i=j+1;continue;}
  if(/[A-Za-z_]/.test(c)){let j=i;while(j<src.length&&/[A-Za-z0-9_-]/.test(src[j]))j++;out.push({t:'id',v:src.slice(i,j),pos:i});i=j;continue;}
  const op=OPS.find(o=>src.startsWith(o,i));
  if(!op)throw new WhenSyntaxError(`unexpected "${c}"`,i);
  out.push({t:'op',v:op,pos:i});i+=op.length;
 }
 return out;
}
export type WhenNode=
 |{k:'lit';v:string|number|boolean|null}
 |{k:'path';p:readonly string[]}
 |{k:'not';a:WhenNode}
 |{k:'bin';op:'&&'|'||'|'=='|'!='|'<'|'<='|'>'|'>=';a:WhenNode;b:WhenNode};
export function parseWhen(src:string):WhenNode{
 const toks=lex(src);let p=0;
 const peek=()=>toks[p],isOp=(v:string)=>peek()?.t==='op'&&peek()!.v===v;
 const fail=(m:string):never=>{throw new WhenSyntaxError(m,peek()?.pos??src.length);};
 function or():WhenNode{let a=and();while(isOp('||')){p++;a={k:'bin',op:'||',a,b:and()};}return a;}
 function and():WhenNode{let a=not();while(isOp('&&')){p++;a={k:'bin',op:'&&',a,b:not()};}return a;}
 function not():WhenNode{if(isOp('!')){p++;return {k:'not',a:not()};}return cmp();}
 function cmp():WhenNode{
  const a=atom();const t=peek();
  if(t?.t==='op'&&['==','!=','<','<=','>','>='].includes(t.v)){p++;return {k:'bin',op:t.v as never,a,b:atom()};}
  return a;
 }
 function atom():WhenNode{
  const t=peek();if(!t)return fail('unexpected end');
  if(t.t==='num'){p++;const n=Number(t.v);if(Number.isNaN(n))fail('bad number');return {k:'lit',v:n};}
  if(t.t==='str'){p++;return {k:'lit',v:t.v};}
  if(t.t==='id'){
   p++;if(t.v==='true')return {k:'lit',v:true};if(t.v==='false')return {k:'lit',v:false};if(t.v==='null')return {k:'lit',v:null};
   const path=[t.v];while(isOp('.')){p++;const n=peek();if(n?.t!=='id')fail('identifier expected');path.push(n!.v);p++;}
   return {k:'path',p:path};
  }
  if(isOp('(')){p++;const e=or();if(!isOp(')'))fail('")" expected');p++;return e;}
  return fail(`unexpected "${t.v}"`);
 }
 if(!toks.length)throw new WhenSyntaxError('empty expression',0);
 const n=or();if(p<toks.length)fail(`unexpected "${toks[p].v}"`);return n;
}
const FORBIDDEN=new Set(['__proto__','constructor','prototype']);
function read(ctx:unknown,path:readonly string[]):unknown{
 let cur:unknown=ctx;
 for(const k of path){
  if(FORBIDDEN.has(k)||cur===null||typeof cur!=='object'||!Object.prototype.hasOwnProperty.call(cur,k))return undefined;
  cur=(cur as Record<string,unknown>)[k];
 }
 return cur;
}
function ev(n:WhenNode,ctx:unknown):unknown{
 switch(n.k){
  case 'lit':return n.v;
  case 'path':return read(ctx,n.p);
  case 'not':return !ev(n.a,ctx);
  case 'bin':{
   if(n.op==='&&')return ev(n.a,ctx)&&ev(n.b,ctx);
   if(n.op==='||')return ev(n.a,ctx)||ev(n.b,ctx);
   const a=ev(n.a,ctx),b=ev(n.b,ctx);
   if(n.op==='==')return a===b;if(n.op==='!=')return a!==b;
   if(typeof a!=='number'||typeof b!=='number')return false;
   return n.op==='<'?a<b:n.op==='<='?a<=b:n.op==='>'?a>b:a>=b;
  }
 }
}
const cache=new Map<string,WhenNode|WhenSyntaxError>();
/** Compile with a cache. Invalid expressions are remembered and evaluate to false (never throw at render time). */
export function compileWhen(src:string):WhenNode|WhenSyntaxError{
 let c=cache.get(src);if(!c){try{c=parseWhen(src);}catch(e){c=e instanceof WhenSyntaxError?e:new WhenSyntaxError(String(e),0);}if(cache.size>500)cache.clear();cache.set(src,c);}
 return c;
}
/** undefined/empty expression = always true. Syntax error = false. */
export function evalWhen(src:string|undefined,ctx:unknown):boolean{
 if(src===undefined||src.trim()==='')return true;
 const c=compileWhen(src);if(c instanceof WhenSyntaxError)return false;
 return !!ev(c,ctx);
}
export const validateWhen=(src:string):string|null=>{const c=compileWhen(src);return c instanceof WhenSyntaxError?c.message:null;};
