/** Math preview for .tex files. This is NOT a LaTeX compiler: it renders the text between \begin{document} and \end{document} (or the whole file), headings, lists, a few text commands and math. Everything else is skipped and reported. Nothing is ever executed (\input, \include, \write and friends are only listed). */
import {extractMath} from './mathExtract';
import {esc,fillMath,type MathSink} from './mathRender';
import type {MathItem} from './mathExtract';
export interface TexResult{html:string;/** Commands that were left out, de-duplicated, in order of appearance. */ignored:string[];warnings:{line:number;message:string}[]}
const stripComments=(s:string)=>s.replace(/(^|[^\\])%.*$/gm,'$1');
const lineCount=(s:string)=>{let c=0;for(const ch of s)if(ch==='\n')c++;return c;};
const TRANSPARENT=/^(textsc|textrm|textsf|mbox|hbox|text|textnormal|mathrm)$/;
const STYLE:Record<string,string>={textbf:'strong',textit:'em',emph:'em',textsl:'em',texttt:'code',underline:'u'};
const SYMBOL:Record<string,string>={ldots:'…',dots:'…',LaTeX:'LaTeX',TeX:'TeX',S:'§',textbackslash:'\\',textasciitilde:'~'};
export function renderTex(src:string,sink:MathSink):TexResult{
 const text=stripComments(src.replace(/\r\n?/g,'\n'));
 const ignored:string[]=[];const warnings:{line:number;message:string}[]=[];const items:MathItem[]=[];
 const ignore=(c:string)=>{const t=c.length>70?c.slice(0,67)+'...':c;if(!ignored.includes(t))ignored.push(t);};
 const b=text.indexOf('\\begin{document}');const e=text.lastIndexOf('\\end{document}');
 let body=text,bodyLine=1;
 if(b>=0){const pre=text.slice(0,b);for(const m of pre.matchAll(/\\[a-zA-Z]+\*?(?:\[[^\]\n]*\])?(?:\{[^{}\n]*\})?/g))ignore(m[0]);
  const from=b+'\\begin{document}'.length;body=text.slice(from,e>from?e:undefined);bodyLine=1+lineCount(text.slice(0,from));}
 const secNo=[0,0,0];let eq=0;
 const inline=(raw:string,line:number):string=>{
  const x=extractMath(raw,{markdown:false,startLine:line});
  x.warnings.forEach(w=>warnings.push(w));
  const base=items.length;items.push(...x.items);
  let t=x.text.replace(/\\([&%_#{}])/g,(_m,c:string)=>`\u0002${c.charCodeAt(0)}\u0003`);
  t=esc(t);
  for(let n=0;n<6;n++){const before=t;t=t.replace(/\\(textbf|textit|emph|textsl|texttt|underline)\{([^{}]*)\}/g,(_m,c:string,inner:string)=>`<${STYLE[c]}>${inner}</${STYLE[c]}>`);if(t===before)break;}
  t=t.replace(/\\\\(?:\[[^\]]*\])?/g,'<br>').replace(/~/g,'\u00a0').replace(/---/g,'\u2014').replace(/--/g,'\u2013');
  t=t.replace(/\\([a-zA-Z]+)\*?(?:\[[^\]]*\])?((?:\{[^{}]*\})*)/g,(m,c:string,args:string)=>{
   if(SYMBOL[c]!==undefined)return SYMBOL[c]+(args?'':'');
   if(TRANSPARENT.test(c))return args.replace(/^\{|\}$/g,'').replace(/\}\{/g,' ');
   ignore(m.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"'));return '';});
  t=t.replace(/[{}]/g,'').replace(/\u0002(\d+)\u0003/g,(_m,c:string)=>esc(String.fromCharCode(+c)));
  // Placeholders refer to this paragraph's items; shift them to the shared list.
  t=t.replace(/\u0001(\d+)\u0001/g,(_m,i:string)=>`\u0001${base+ +i}\u0001`);
  return t;};
 const mathBlock=(tex:string,line:number,numbered:boolean)=>{items.push({tex:tex.trim(),display:true,line});const no=numbered?`<span class="tex-eqno">(${++eq})</span>`:'';return `<div class="tex-eq"><div class="tex-eq-body">\u0001${items.length-1}\u0001</div>${no}</div>`;};
 const parse=(s:string,baseLine:number):string=>{
  const out:string[]=[];let p=0;const lineAt=(i:number)=>baseLine+lineCount(s.slice(0,i));
  const START=/\\(sub){0,2}section\*?\{|\\begin\{(equation|align|gather|itemize|enumerate)(\*?)\}|\n[ \t]*\n/g;
  while(p<s.length){
   START.lastIndex=p;const m=START.exec(s);const stop=m?m.index:s.length;
   const chunk=s.slice(p,stop);
   if(chunk.trim()){const lead=chunk.length-chunk.replace(/^\s+/,'').length;out.push(`<p>${inline(chunk.trim().replace(/[ \t]*\n[ \t]*/g,'\n'),lineAt(p+lead)).replace(/\n/g,' ')}</p>`);}
   if(!m){break;}
   if(m[0].startsWith('\n')){p=stop+m[0].length;continue;}
   if(m[0].startsWith('\\begin')){
    const env=m[2],star=m[3]==='*';const endTag=`\\end{${env}${star?'*':''}}`;const from=m.index+m[0].length;
    if(env==='itemize'||env==='enumerate'){
     let depth=1,k=from,end=-1;const re=/\\begin\{(?:itemize|enumerate)\}|\\end\{(?:itemize|enumerate)\}/g;re.lastIndex=from;let q:RegExpExecArray|null;
     while((q=re.exec(s))){if(q[0].startsWith('\\begin'))depth++;else if(--depth===0){end=q.index;k=q.index+q[0].length;break;}}
     if(end<0){warnings.push({line:lineAt(m.index),message:`\\begin{${env}} is never closed`});p=from;continue;}
     const inner=s.slice(from,end);const parts:{at:number;text:string}[]=[];let d=0,last=-1;const it=/\\begin\{(?:itemize|enumerate)\}|\\end\{(?:itemize|enumerate)\}|\\item\b(?:\[[^\]]*\])?/g;let r:RegExpExecArray|null;
     while((r=it.exec(inner))){if(r[0].startsWith('\\begin'))d++;else if(r[0].startsWith('\\end'))d--;else if(d===0){if(last>=0)parts.push({at:last,text:inner.slice(last,r.index)});last=r.index+r[0].length;}}
     if(last>=0)parts.push({at:last,text:inner.slice(last)});
     const tag=env==='itemize'?'ul':'ol';
     out.push(`<${tag} class="tex-list">${parts.map(x=>`<li>${parse(x.text.trim(),lineAt(from+x.at))}</li>`).join('')}</${tag}>`);p=k;continue;}
    const end=s.indexOf(endTag,from);
    if(end<0){warnings.push({line:lineAt(m.index),message:`\\begin{${env}${star?'*':''}} is never closed`});p=from;continue;}
    const inner=s.slice(from,end);const tex=env==='align'?`\\begin{aligned}${inner}\\end{aligned}`:env==='gather'?`\\begin{gathered}${inner}\\end{gathered}`:inner;
    out.push(mathBlock(tex,lineAt(m.index),!star));p=end+endTag.length;continue;}
   // Section heading.
   const level=m[0].startsWith('\\subsub')?2:m[0].startsWith('\\sub')?1:0;const star=m[0].includes('*{');
   const from=m.index+m[0].length;let depth=1,k=from;while(k<s.length&&depth>0){if(s[k]==='{')depth++;else if(s[k]==='}')depth--;k++;}
   const title=s.slice(from,k-1);let num='';
   if(!star){secNo[level]++;for(let z=level+1;z<3;z++)secNo[z]=0;num=secNo.slice(0,level+1).join('.')+' ';}
   out.push(`<h${level+2} class="tex-sec">${num}${inline(title,lineAt(from))}</h${level+2}>`);p=k;}
  return out.join('\n');};
 const html=fillMath(parse(body,bodyLine),items,sink);
 return{html,ignored,warnings};}
