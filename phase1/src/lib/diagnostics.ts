import {EditorState} from '@codemirror/state';
import {html} from '@codemirror/lang-html';
import {css} from '@codemirror/lang-css';
import {javascript} from '@codemirror/lang-javascript';
import {ensureSyntaxTree,syntaxTree} from '@codemirror/language';
import type {Diagnostic} from '@codemirror/lint';
/** Syntax lint shared by the editor gutter and the Problems panel: reports parser error nodes and unclosed tags from the language tree. No network, no code execution. */
export function lintState(state:EditorState):Diagnostic[]{const out:Diagnostic[]=[];const VOID=/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i,OPTIONAL=/^(p|li|dt|dd|tr|td|th|thead|tbody|tfoot|option|optgroup|colgroup|html|head|body)$/i;
 syntaxTree(state).iterate({enter:n=>{if(n.name==='Element'&&out.length<50){const kids=[];for(let c=n.node.firstChild;c;c=c.nextSibling)kids.push(c);const open=kids.find(k=>k.name==='OpenTag');const tag=open?state.sliceDoc(open.from,open.to).match(/^<\s*([A-Za-z][\w:-]*)/)?.[1]:undefined;if(open&&tag&&!VOID.test(tag)&&!OPTIONAL.test(tag)&&!kids.some(k=>k.name==='CloseTag'||k.name==='SelfClosingTag'||k.name==='MismatchedCloseTag')&&!/\/\s*>$/.test(state.sliceDoc(open.from,open.to)))out.push({from:open.from,to:open.to,severity:'warning',message:`Missing closing tag </${tag}>.`});}
 if(n.type.isError&&out.length<50)out.push({from:n.from,to:Math.max(n.to,Math.min(n.from+1,state.doc.length)),severity:'error',message:'Syntax problem here (unclosed or unexpected token).'});}});return out;}
export interface Problem{file:string;line:number;col:number;severity:'error'|'warning';message:string}
const languageFor=(file:string)=>/\.html?$/i.test(file)?html():/\.css$/i.test(file)?css():/\.[jt]sx?$/i.test(file)?javascript({jsx:true,typescript:/\.tsx?$/.test(file)}):null;
/** Lints one file's text without an editor view. Unsupported file types return no problems. */
export function computeDiagnostics(file:string,text:string):Problem[]{
 const lang=languageFor(file);if(!lang||text.length>600_000)return [];
 const state=EditorState.create({doc:text,extensions:[lang]});ensureSyntaxTree(state,state.doc.length,2000);
 return lintState(state).map(d=>{const l=state.doc.lineAt(Math.min(d.from,state.doc.length));return {file,line:l.number,col:d.from-l.from+1,severity:d.severity==='error'?'error':'warning',message:d.message} as Problem;});}
/** Lints every project file, errors first, capped so a broken minified bundle cannot flood the panel. */
export function projectProblems(files:Readonly<Record<string,string>>):Problem[]{
 const all:Problem[]=[];for(const f of Object.keys(files).sort())all.push(...computeDiagnostics(f,files[f]).slice(0,50));
 return all.sort((a,b)=>(a.severity===b.severity?0:a.severity==='error'?-1:1)).slice(0,500);}
