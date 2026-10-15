import type {FunctionInfo} from './protocol';
/** The function call being typed at the caret of a formula, for the argument hint under the formula bar. Read only; never evaluates anything. */
export interface CallAt{name:string;arg:number}
const MAX_FORMULA_CHARS=8192;
export function callAtCaret(text:string,caret:number):CallAt|null{
 if(!text.startsWith('=')||text.length>MAX_FORMULA_CHARS)return null;
 const end=Math.max(0,Math.min(caret,text.length));
 const stack:{name:string;arg:number}[]=[];let braces=0,i=1;
 while(i<end){
  const ch=text[i];
  if(ch==='"'||ch==="'"){i++;while(i<end){if(text[i]===ch){if(text[i+1]===ch){i+=2;continue;}break;}i++;}i++;continue;}
  if(ch==='('){const m=/([A-Za-z_][A-Za-z0-9_.]*)$/.exec(text.slice(0,i));stack.push({name:m?m[1]:'',arg:0});}
  else if(ch===')'){stack.pop();}
  else if(ch==='{')braces++;
  else if(ch==='}')braces=Math.max(0,braces-1);
  else if((ch===','||ch===';')&&braces===0){const top=stack[stack.length-1];if(top)top.arg++;}
  i++;
 }
 for(let k=stack.length-1;k>=0;k--)if(stack[k].name)return {name:stack[k].name,arg:stack[k].arg};
 return null;
}
/** "SUM(number1, [number2], ...)" to ["number1","[number2]","..."]; commas inside [ ] stay together. */
export function signatureArgs(signature:string):string[]{
 const o=signature.indexOf('('),e=signature.lastIndexOf(')');if(o<0||e<=o)return [];
 const out:string[]=[];let depth=0,cur='';
 for(const ch of signature.slice(o+1,e)){
  if(ch==='[')depth++;else if(ch===']')depth=Math.max(0,depth-1);
  if(ch===','&&depth===0){out.push(cur.trim());cur='';}else cur+=ch;
 }
 out.push(cur.trim());return out.filter(a=>a!=='');
}
export interface FunctionHint{name:string;args:string[];active:number;description:string}
export function functionHint(fns:readonly FunctionInfo[],text:string,caret:number):FunctionHint|null{
 const c=callAtCaret(text,caret);if(!c)return null;
 const up=c.name.toUpperCase(),f=fns.find(x=>x.name===up);if(!f)return null;
 const args=signatureArgs(f.signature);
 return {name:f.name,args,active:args.length===0?-1:Math.min(c.arg,args.length-1),description:f.description};
}
