/**
 * Source-preserving SVG scanner and text patches.
 * The SVG text stays the single source of truth. Every edit is a small text splice on one element, so a moved
 * rectangle changes only its own tag. defs, style, filters, comments and formatting are never re-serialised.
 */
import {decodeEntities} from '../vectorio/xml';
export interface XAttr{name:string;value:string;from:number;to:number;vFrom:number;vTo:number;quote:string}
export interface XEl{tag:string;attrs:XAttr[];from:number;to:number;nameEnd:number;startEnd:number;selfClosing:boolean;endFrom:number;children:XEl[];parent:XEl|null;path:number[]}
export interface Patch{from:number;to:number;insert:string}
export type ScanResult={ok:true;root:XEl}|{ok:false;error:string};
const NAME=/[^\s/>=]/;
export function scanSvg(text:string):ScanResult{
 let i=text.charCodeAt(0)===0xfeff?1:0;const stack:XEl[]=[];let root:XEl|null=null;const n=text.length;
 const fail=(m:string):ScanResult=>({ok:false,error:m});
 while(i<n){
  const lt=text.indexOf('<',i);if(lt<0)break;i=lt;
  if(text.startsWith('<!--',i)){const e=text.indexOf('-->',i+4);if(e<0)return fail('Unclosed comment');i=e+3;continue;}
  if(text.startsWith('<![CDATA[',i)){const e=text.indexOf(']]>',i);if(e<0)return fail('Unclosed CDATA section');i=e+3;continue;}
  if(text.startsWith('<?',i)){const e=text.indexOf('?>',i);if(e<0)return fail('Unclosed processing instruction');i=e+2;continue;}
  if(text.startsWith('<!',i)){let depth=0,j=i+2;for(;j<n;j++){const c=text[j];if(c==='[')depth++;else if(c===']')depth--;else if(c==='>'&&depth<=0)break;}if(j>=n)return fail('Unclosed declaration');i=j+1;continue;}
  if(text.startsWith('</',i)){const e=text.indexOf('>',i);if(e<0)return fail('Unclosed end tag');const name=text.slice(i+2,e).trim();const el=stack.pop();if(!el||el.tag!==name)return fail(`Mismatched end tag </${name}>`);el.endFrom=i;el.to=e+1;i=e+1;continue;}
  // start tag
  let j=i+1;while(j<n&&NAME.test(text[j]))j++;const tag=text.slice(i+1,j);if(!tag)return fail('Stray "<"');
  const el:XEl={tag,attrs:[],from:i,to:-1,nameEnd:j,startEnd:-1,selfClosing:false,endFrom:-1,children:[],parent:stack[stack.length-1]??null,path:[]};
  for(;;){
   while(j<n&&/\s/.test(text[j]))j++;
   if(j>=n)return fail(`Unclosed <${tag}>`);
   if(text[j]==='>'){el.startEnd=j+1;break;}
   if(text[j]==='/'&&text[j+1]==='>'){el.selfClosing=true;el.startEnd=j+2;break;}
   const as=j;while(j<n&&NAME.test(text[j]))j++;const name=text.slice(as,j);if(!name)return fail(`Bad attribute in <${tag}>`);
   while(j<n&&/\s/.test(text[j]))j++;
   if(text[j]!=='=')return fail(`Attribute ${name} has no value`);
   j++;while(j<n&&/\s/.test(text[j]))j++;
   const q=text[j];if(q!=='"'&&q!=="'")return fail(`Attribute ${name} is not quoted`);
   const ve=text.indexOf(q,j+1);if(ve<0)return fail(`Unclosed value of ${name}`);
   el.attrs.push({name,value:decodeEntities(text.slice(j+1,ve)),from:as,to:ve+1,vFrom:j+1,vTo:ve,quote:q});j=ve+1;
  }
  const parent=stack[stack.length-1];
  if(parent){el.path=[...parent.path,parent.children.length];parent.children.push(el);}
  else{if(root)return fail('More than one root element');root=el;}
  if(el.selfClosing){el.to=el.startEnd;el.endFrom=el.startEnd;}else stack.push(el);
  i=el.startEnd;
 }
 if(stack.length)return fail(`Unclosed <${stack[stack.length-1].tag}>`);
 if(!root)return fail('No root element');
 if(root.tag!=='svg'&&!root.tag.endsWith(':svg'))return fail('The root element is not <svg>');
 return{ok:true,root};
}
export const attr=(el:XEl,name:string):string|undefined=>el.attrs.find(a=>a.name===name)?.value;
export function elementAt(root:XEl,path:number[]):XEl|null{let el:XEl=root;for(const k of path){const c=el.children[k];if(!c)return null;el=c;}return el;}
export const pathKey=(p:number[])=>p.join('.');
export const parsePathKey=(k:string)=>k===''?[]:k.split('.').map(Number);
export const isAncestor=(a:number[],b:number[])=>a.length<b.length&&a.every((v,i)=>b[i]===v);
export function walk(el:XEl,fn:(e:XEl)=>void){fn(el);el.children.forEach(c=>walk(c,fn));}
export function applyPatches(text:string,patches:Patch[]):string{
 const sorted=[...patches].sort((a,b)=>b.from-a.from||b.to-a.to);let out=text;
 for(const p of sorted)out=out.slice(0,p.from)+p.insert+out.slice(p.to);return out;}
export const escapeValue=(v:string,q='"')=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(q==='"'?/"/g:/'/g,q==='"'?'&quot;':'&apos;');
export const escapeText=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
/** Patches that set (or remove, with null) attributes on one element. Existing values are replaced in place. */
export function attrPatches(el:XEl,changes:Record<string,string|null>,text:string):Patch[]{
 const out:Patch[]=[];const adds:string[]=[];
 for(const [name,value] of Object.entries(changes)){
  const a=el.attrs.find(x=>x.name===name);
  if(a){if(value===null){let f=a.from;while(f>el.nameEnd&&/\s/.test(text[f-1]))f--;out.push({from:f,to:a.to,insert:''});}else out.push({from:a.vFrom,to:a.vTo,insert:escapeValue(value,a.quote)});}
  else if(value!==null)adds.push(` ${name}="${escapeValue(value)}"`);
 }
 if(adds.length){const at=el.attrs.length?el.attrs[el.attrs.length-1].to:el.nameEnd;out.push({from:at,to:at,insert:adds.join('')});}
 return out;}
export const setAttrs=(text:string,el:XEl,changes:Record<string,string|null>)=>applyPatches(text,attrPatches(el,changes,text));
/** Start of the line that holds `pos`, and the indent of that line. */
export function lineInfo(text:string,pos:number){const s=text.lastIndexOf('\n',pos-1)+1;const m=/^[ \t]*/.exec(text.slice(s,pos))![0];return{lineStart:s,indent:m};}
/** Source range of an element including its own line when it is alone on it. */
export function blockRange(text:string,el:XEl):{from:number;to:number}{
 let f=el.from,t=el.to;let a=f;while(a>0&&(text[a-1]===' '||text[a-1]==='\t'))a--;
 let b=t;while(b<text.length&&(text[b]===' '||text[b]==='\t'))b++;
 const lineBefore=a===0||text[a-1]==='\n';const lineAfter=b>=text.length||text[b]==='\n'||text[b]==='\r';
 if(lineBefore&&lineAfter){f=a;t=b;if(text[t]==='\r')t++;if(text[t]==='\n')t++;}
 return{from:f,to:t};}
export function removePatch(text:string,el:XEl):Patch{const r=blockRange(text,el);return{from:r.from,to:r.to,insert:''};}
const reindent=(s:string,from:string,to:string)=>s.split('\n').map((l,i)=>i===0?l:(l.startsWith(from)?to+l.slice(from.length):l)).join('\n');
/** Source of an element, re-indented so its first line starts at `indent`. */
export function elementSource(text:string,el:XEl,indent:string):string{const {indent:old}=lineInfo(text,el.from);return reindent(text.slice(el.from,el.to),old,indent);}
/** Where to insert a child: before `before`, or at the end of `parent`. Returns the splice and the child's indent. */
export function insertionPoint(text:string,parent:XEl,before:XEl|null):{patches:Patch[];indent:string;wrap:(s:string)=>string}{
 const pIndent=lineInfo(text,parent.from).indent;
 const step=pIndent.includes('\t')?'\t':'  ';
 const sib=before??parent.children[parent.children.length-1];
 const indent=sib&&lineInfo(text,sib.from).lineStart<=sib.from&&/^[ \t]*$/.test(text.slice(lineInfo(text,sib.from).lineStart,sib.from))?lineInfo(text,sib.from).indent:pIndent+step;
 if(parent.selfClosing){
  const open=text.slice(parent.from,parent.startEnd-2).replace(/\s+$/,'');
  return{patches:[{from:parent.from,to:parent.startEnd,insert:''}],indent,wrap:s=>`${open}>\n${indent}${s}\n${pIndent}</${parent.tag}>`};}
 if(before){const bs=lineInfo(text,before.from);const own=/^[ \t]*$/.test(text.slice(bs.lineStart,before.from));
  if(own)return{patches:[],indent,wrap:s=>`${indent}${s}\n`};
  return{patches:[],indent,wrap:s=>s};}
 // append: place on its own line just before the closing tag when that tag has its own line
 const endLine=lineInfo(text,parent.endFrom);const closeOwn=/^[ \t]*$/.test(text.slice(endLine.lineStart,parent.endFrom));
 if(closeOwn)return{patches:[],indent,wrap:s=>`${indent}${s}\n`};
 return{patches:[],indent,wrap:s=>`\n${indent}${s}\n${pIndent}`};}
/** Insert `src` (one element) into `parent` before `before` (or last). Returns the new text. */
export function insertChild(text:string,parent:XEl,before:XEl|null,src:string):string{
 const ip=insertionPoint(text,parent,before);
 if(parent.selfClosing)return applyPatches(text,[{from:parent.from,to:parent.startEnd,insert:ip.wrap(src)}]);
 const at=before?(/^[ \t]*$/.test(text.slice(lineInfo(text,before.from).lineStart,before.from))?lineInfo(text,before.from).lineStart:before.from):(/^[ \t]*$/.test(text.slice(lineInfo(text,parent.endFrom).lineStart,parent.endFrom))?lineInfo(text,parent.endFrom).lineStart:parent.endFrom);
 return applyPatches(text,[{from:at,to:at,insert:ip.wrap(src)}]);}
export function innerTextRange(el:XEl):{from:number;to:number}|null{return el.selfClosing?null:{from:el.startEnd,to:el.endFrom};}
export const hasElementChildren=(el:XEl)=>el.children.length>0;
