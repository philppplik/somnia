import {EditorState} from '@codemirror/state';
import {languageFor,modeFor} from './languages';
import {ensureSyntaxTree,syntaxTree} from '@codemirror/language';
import type {Diagnostic} from '@codemirror/lint';
import {a11yProblems} from './a11y';
/** Syntax lint shared by the editor gutter and the Problems panel: reports parser error nodes and unclosed tags from the language tree. No network, no code execution. */
export function lintState(state:EditorState):Diagnostic[]{const out:Diagnostic[]=[];const VOID=/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i,OPTIONAL=/^(p|li|dt|dd|tr|td|th|thead|tbody|tfoot|option|optgroup|colgroup|html|head|body)$/i;
 syntaxTree(state).iterate({enter:n=>{if(n.name==='Element'&&out.length<50){const kids=[];for(let c=n.node.firstChild;c;c=c.nextSibling)kids.push(c);const open=kids.find(k=>k.name==='OpenTag');const tag=open?state.sliceDoc(open.from,open.to).match(/^<\s*([A-Za-z][\w:-]*)/)?.[1]:undefined;if(open&&tag&&!VOID.test(tag)&&!OPTIONAL.test(tag)&&!kids.some(k=>k.name==='CloseTag'||k.name==='SelfClosingTag'||k.name==='MismatchedCloseTag')&&!/\/\s*>$/.test(state.sliceDoc(open.from,open.to)))out.push({from:open.from,to:open.to,severity:'warning',message:`Missing closing tag </${tag}>.`});}
 if(n.type.isError&&out.length<50)out.push({from:n.from,to:Math.max(n.to,Math.min(n.from+1,state.doc.length)),severity:'error',message:'Syntax problem here (unclosed or unexpected token).'});}});return out;}
export interface Problem{file:string;line:number;col:number;severity:'error'|'warning';message:string}
const languageForLint=(file:string)=>modeFor(file)==='plain'?null:languageFor(file);
/** Lints one file's text without an editor view. Unsupported file types return no problems. */
export function computeDiagnostics(file:string,text:string):Problem[]{
 const lang=languageForLint(file);if(!lang||text.length>600_000)return [];
 const state=EditorState.create({doc:text,extensions:[lang]});ensureSyntaxTree(state,state.doc.length,2000);
 return lintState(state).map(d=>{const l=state.doc.lineAt(Math.min(d.from,state.doc.length));return {file,line:l.number,col:d.from-l.from+1,severity:d.severity==='error'?'error':'warning',message:d.message} as Problem;});}
/** Stylesheets and scripts that point at a project file which does not exist. The design preview inlines only existing local CSS, so a wrong path explains missing styles. */
export function referenceProblems(files:Readonly<Record<string,string>>):Problem[]{
 const out:Problem[]=[];
 for(const f of Object.keys(files).sort()){if(!/\.html?$/i.test(f))continue;const text=files[f];
  const resolve=(href:string)=>{if(/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(href))return null;const parts=[...f.split('/').slice(0,-1),...href.split(/[?#]/)[0].split('/')],o:string[]=[];for(const q of parts){if(q==='..')o.pop();else if(q&&q!=='.')o.push(q);}return o.join('/');};
  for(const m of text.matchAll(/<(link|script)\b[^>]*>/gi)){const tag=m[0];const isCss=m[1].toLowerCase()==='link';if(isCss&&!/\brel\s*=\s*["']?stylesheet/i.test(tag))continue;const attr=/\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);const ref=attr?(attr[1]??attr[2]):'';if(!ref)continue;const path=resolve(ref);if(path===null||path===''||path in files)continue;
   const before=text.slice(0,m.index);const line=before.split('\n').length;out.push({file:f,line,col:before.length-before.lastIndexOf('\n'),severity:'warning',message:`${isCss?'Stylesheet':'Script'} not found in the project: ${ref}`});}}
 return out;}
/** Basic accessibility checks on HTML text: image alt, page language and title, heading order. Warnings only. */
export function accessibilityProblems(files:Readonly<Record<string,string>>):Problem[]{
 const out:Problem[]=[];
 for(const f of Object.keys(files).sort()){if(!/\.html?$/i.test(f))continue;const text=files[f];const at=(i:number)=>{const b=text.slice(0,i);return{line:b.split('\n').length,col:b.length-b.lastIndexOf('\n')};};const add=(i:number,message:string)=>out.push({file:f,...at(i),severity:'warning',message});
  const full=/<html\b/i.test(text);
  if(full){const h=/<html\b[^>]*>/i.exec(text)!;if(!/\blang\s*=\s*["'][^"']+["']/i.test(h[0]))add(h.index,'The page has no language. Add lang="en" (or your language) to <html>.');if(!/<title\b[^>]*>\s*\S/i.test(text))add(h.index,'The page has no title. Add a non-empty <title> in <head>.');}
  for(const m of text.matchAll(/<img\b[^>]*>/gi))if(!/\balt\s*=/i.test(m[0]))add(m.index!,'Image has no alt attribute. Describe it, or use alt="" if it is decorative.');
  let prev=0,h1=0;for(const m of text.matchAll(/<h([1-6])\b/gi)){const lv=Number(m[1]);if(lv===1&&++h1>1)add(m.index!,'More than one <h1> on the page.');if(prev&&lv>prev+1)add(m.index!,`Heading level jumps from h${prev} to h${lv}.`);prev=lv;}
 }
 return out;}
/** Lints every project file, errors first, capped so a broken minified bundle cannot flood the panel. */
export function projectProblems(files:Readonly<Record<string,string>>):Problem[]{
 const all:Problem[]=[];for(const f of Object.keys(files).sort())all.push(...computeDiagnostics(f,files[f]).slice(0,50));all.push(...referenceProblems(files),...accessibilityProblems(files),...a11yProblems(files));
 return all.sort((a,b)=>(a.severity===b.severity?0:a.severity==='error'?-1:1)).slice(0,500);}
