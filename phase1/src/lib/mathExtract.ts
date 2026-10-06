/** Finds math in text before any Markdown escaping happens. Pure string work, no KaTeX. Rules: $...$ and \(...\) inline, $$...$$ and \[...\] block. Code spans and fenced code are skipped, \$ is a dollar sign, and price-like dollars ("5 $ and 7 $", "$5 or $10") stay text. */
export interface MathItem{tex:string;display:boolean;/** 1-based line of the opening delimiter. */line:number}
export interface MathWarning{line:number;message:string}
export interface ExtractResult{text:string;items:MathItem[];warnings:MathWarning[]}
export interface ExtractOptions{/** Skip fenced code and code spans (Markdown). Default true. */markdown?:boolean;/** Line number of the first line of src. Default 1. */startLine?:number;/** Keep the line count: after each placeholder add one \\n + \\u0002 marker per source line the formula spanned, so a renderer's line maps still match the source. */keepLines?:boolean}
/** Quick check: could this text contain math at all? Used to decide whether to load the engine. */
export const hasMathDelims=(s:string)=>/\$[^\s$]|\\\(|\\\[/.test(s);
/** True when the text really holds at least one formula (runs the full extraction, so call it on debounced text). */
export const hasMath=(s:string)=>hasMathDelims(s)&&extractMath(s).items.length>0;
export const PLACEHOLDER=/\u0001(\d+)\u0001/g;
const ws=(c:string|undefined)=>c===undefined||/\s/.test(c);
export function extractMath(src:string,o:ExtractOptions={}):ExtractResult{
 const md=o.markdown!==false;const base=(o.startLine??1)-1;
 const items:MathItem[]=[],warnings:MathWarning[]=[];let out='';let i=0,line=0;
 const n=src.length;
 /** End of the current paragraph (next blank line) or end of text. */
 const paraEnd=(from:number)=>{const m=/\n[ \t]*\n/.exec(src.slice(from));return m?from+m.index:n;};
 const lines=(s:string)=>{let c=0;for(const ch of s)if(ch==='\n')c++;return c;};
 const push=(tex:string,display:boolean,startAt:number)=>{items.push({tex:tex.trim(),display,line:base+line+1});const k=lines(src.slice(startAt,i));out+=`\u0001${items.length-1}\u0001`+(o.keepLines?'\n\u0002'.repeat(k):'');line+=k;};
 const atLineStart=()=>i===0||src[i-1]==='\n';
 while(i<n){
  const c=src[i];
  if(md&&atLineStart()){const f=/^ {0,3}(`{3,}|~{3,})/.exec(src.slice(i,i+200));
   if(f){let j=src.indexOf('\n',i);let end=n;let k=j<0?n:j+1;
    while(k<n){const e=src.indexOf('\n',k);const ln=src.slice(k,e<0?n:e);if(ln.trim().startsWith(f[1])){end=e<0?n:e+1;break;}k=e<0?n:e+1;end=k;}
    const chunk=src.slice(i,end);out+=chunk;line+=lines(chunk);i=end;continue;}}
  if(md&&c==='`'){let j=i;while(src[j]==='`')j++;const run=src.slice(i,j);let k=j,found=-1;
   while(k<n){const p=src.indexOf(run,k);if(p<0)break;let q=p+run.length;if(src[p-1]!=='`'&&src[q]!=='`'){found=q;break;}k=p+1;}
   if(found>0){const chunk=src.slice(i,found);out+=chunk;line+=lines(chunk);i=found;continue;}
   out+=run;i=j;continue;}
  if(c==='\\'){
   const nx=src[i+1];
   if(nx==='$'){out+='$';i+=2;continue;}
   if(nx==='('||nx==='['){const close=nx==='('?'\\)':'\\]';const end=paraEnd(i+2);const p=src.slice(i+2,end).indexOf(close);
    if(p>=0&&src.slice(i+2,i+2+p).trim()){const start=i;i=i+2+p+2;push(src.slice(start+2,i-2),nx==='[',start);continue;}
    if(nx==='['&&p<0)warnings.push({line:base+line+1,message:'"\\[" is never closed, treated as text'});
    out+=c+nx;i+=2;continue;}
   if(nx==='\\'){out+='\\\\';i+=2;continue;}
   out+=c;i++;continue;}
  if(c==='$'){
   if(src[i+1]==='$'){const end=paraEnd(i+2);const p=src.slice(i+2,end).indexOf('$$');
    if(p>=0&&src.slice(i+2,i+2+p).trim()){const start=i;i=i+2+p+2;push(src.slice(start+2,i-2),true,start);continue;}
    if(p<0)warnings.push({line:base+line+1,message:'"$$" is never closed, treated as text'});
    out+='$$';i+=2;continue;}
   // Inline: the opener must not be followed by whitespace.
   if(!ws(src[i+1])){const end=paraEnd(i+1);let j=i+1,hit=-1;
    while(j<end){const d=src[j];if(d==='\\'){j+=2;continue;}
     if(d==='$'){if(!ws(src[j-1])&&!/\d/.test(src[j+1]??'')&&src[j+1]!=='$')hit=j;break;}
     j++;}
    if(hit>0){const start=i;i=hit+1;push(src.slice(start+1,hit),false,start);continue;}}
   out+='$';i++;continue;}
  if(c==='\n')line++;
  out+=c;i++;}
 return{text:out,items,warnings};}
