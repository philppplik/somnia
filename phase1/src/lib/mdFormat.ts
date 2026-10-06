/** Markdown formatting commands for the source editor. Each command is one transaction, so it is one undo step, and keeps a sensible selection. */
import {EditorSelection,type EditorState,type TransactionSpec} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
export type MdCommand='bold'|'italic'|'code'|'strike'|'bullet'|'task'|'number'|'quote'|'codeblock'|'table'|'h1'|'h2'|'h3'|'h4'|'h5'|'h6';
/** Wrap or unwrap the selection with a delimiter. With no selection, paired delimiters are inserted with the caret between them. */
function wrap(st:EditorState,open:string,close=open):TransactionSpec{
 const r=st.changeByRange(range=>{
  const doc=st.doc;let {from,to}=range;
  // Do not wrap surrounding whitespace or line breaks (Select all includes the final newline).
  if(!range.empty){const raw=st.sliceDoc(from,to);const lead=raw.length-raw.trimStart().length,trail=raw.length-raw.trimEnd().length;if(lead+trail<raw.length){from+=lead;to-=trail;}}
  // delimiters inside the selection
  const text=st.sliceDoc(from,to);
  if(text.length>=open.length+close.length&&text.startsWith(open)&&text.endsWith(close)&&!(open==='*'&&text.startsWith('**')&&!text.startsWith('***'))){
   return {changes:{from,to,insert:text.slice(open.length,text.length-close.length)},range:EditorSelection.range(from,to-open.length-close.length)};}
  // delimiters just outside the selection
  const before=st.sliceDoc(Math.max(0,from-open.length),from),after=st.sliceDoc(to,Math.min(doc.length,to+close.length));
  if(before===open&&after===close&&!(open==='*'&&(st.sliceDoc(Math.max(0,from-2),from)==='**'&&st.sliceDoc(to,to+2)==='**'&&st.sliceDoc(Math.max(0,from-3),from)!=='***'))){
   return {changes:[{from:from-open.length,to:from},{from:to,to:to+close.length}],range:EditorSelection.range(from-open.length,to-open.length)};}
  return {changes:[{from,insert:open},{from:to,insert:close}],range:range.empty?EditorSelection.cursor(from+open.length):EditorSelection.range(from+open.length,to+open.length)};});
 return {...r,userEvent:'input.format'};}
/** Inline code picks a delimiter longer than any backtick run in the selection. */
function inlineCode(st:EditorState):TransactionSpec{
 const r=st.selection.main;const text=st.sliceDoc(r.from,r.to);
 const m=/^(`+)([\s\S]*?)\1$/.exec(text);if(m&&text.length>=2*m[1].length)return wrap(st,m[1]);
 const longest=Math.max(0,...(text.match(/`+/g)??[]).map(x=>x.length));const d='`'.repeat(longest+1);
 const pad=longest&&(text.startsWith('`')||text.endsWith('`'))?' ':'';return wrap(st,d+pad,pad+d);}
const lineRe={bullet:/^(\s*)[-*+]\s+(?!\[[ xX]\]\s)/,task:/^(\s*)[-*+]\s+\[[ xX]\]\s+/,number:/^(\s*)\d+[.)]\s+/,quote:/^(\s*)>\s?/};
/** Apply a line-prefix style to every selected line. If all non-empty lines already have it, remove it. */
function lines(st:EditorState,kind:'bullet'|'task'|'number'|'quote'):TransactionSpec{
 const doc=st.doc;const set=new Set<number>();
 for(const r of st.selection.ranges){const a=doc.lineAt(r.from).number;let b=doc.lineAt(r.to).number;if(b>a&&r.to===doc.line(b).from)b--;for(let n=a;n<=b;n++)set.add(n);}
 const nums=[...set].sort((x,y)=>x-y);const ls=nums.map(n=>doc.line(n));const body=ls.filter(l=>l.text.trim());const target=body.length?body:ls;
 const has=(t:string)=>lineRe[kind].test(t);const remove=target.every(l=>has(l.text));
 const strip=(t:string)=>t.replace(lineRe.task,'$1').replace(lineRe.bullet,'$1').replace(lineRe.number,'$1').replace(lineRe.quote,'$1');
 let counter=1;const changes=ls.map(l=>{
  const indent=/^\s*/.exec(l.text)![0];const clean=strip(l.text);
  if(!l.text.trim()&&ls.length>1)return {from:l.from,to:l.to,insert:l.text};
  if(remove)return {from:l.from,to:l.to,insert:clean};
  const prefix=kind==='bullet'?'- ':kind==='task'?'- [ ] ':kind==='quote'?'> ':`${counter++}. `;
  return {from:l.from,to:l.to,insert:indent+prefix+clean.slice(indent.length)};});
 return {changes:changes.filter(c=>c.insert!==doc.sliceString(c.from,c.to)),userEvent:'input.format'};}
function heading(st:EditorState,level:number):TransactionSpec{
 const doc=st.doc;const a=doc.lineAt(st.selection.main.from).number,b=doc.lineAt(st.selection.main.to).number;const changes=[];
 const same=Array.from({length:b-a+1},(_,i)=>doc.line(a+i)).filter(l=>l.text.trim()).every(l=>new RegExp(`^#{${level}}\\s`).test(l.text));
 for(let n=a;n<=b;n++){const l=doc.line(n);if(!l.text.trim())continue;const text=l.text.replace(/^\s{0,3}#{1,6}\s+/,'');changes.push({from:l.from,to:l.to,insert:same?text:`${'#'.repeat(level)} ${text}`});}
 return {changes,userEvent:'input.format'};}
function codeblock(st:EditorState,lang=''):TransactionSpec{
 const r=st.selection.main;const doc=st.doc;const a=doc.lineAt(r.from),b=doc.lineAt(r.empty||r.to===r.from?r.to:Math.max(r.from,r.to-(r.to===doc.lineAt(r.to).from?1:0)));
 const open='```'+lang;const inner=doc.sliceString(a.from,b.to);
 if(r.empty&&!a.text.trim())return {changes:{from:a.from,to:a.to,insert:`${open}\n\n\`\`\``},selection:EditorSelection.cursor(a.from+open.length+1),userEvent:'input.format'};
 return {changes:{from:a.from,to:b.to,insert:`${open}\n${inner}\n\`\`\``},selection:EditorSelection.cursor(a.from+open.length+1+inner.length+1+3),userEvent:'input.format'};}
const TABLE='| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n';
function table(st:EditorState):TransactionSpec{
 const r=st.selection.main;const l=st.doc.lineAt(r.to);const atStart=r.from===l.from&&r.empty&&!l.text;const lead=atStart?'':'\n\n';const pos=atStart?l.from:l.to;
 return {changes:{from:pos,insert:lead+TABLE},selection:EditorSelection.range(pos+lead.length+2,pos+lead.length+10),userEvent:'input.format'};}
/** The transaction for a formatting command, or null when it does not apply. */
export function mdTransaction(st:EditorState,cmd:MdCommand,opts:{lang?:string}={}):TransactionSpec|null{
 switch(cmd){
  case 'bold':return wrap(st,'**');case 'italic':return wrap(st,'*');case 'strike':return wrap(st,'~~');case 'code':return inlineCode(st);
  case 'bullet':case 'task':case 'number':case 'quote':return lines(st,cmd);
  case 'codeblock':return codeblock(st,opts.lang);case 'table':return table(st);
  default:return heading(st,+cmd.slice(1));}}
/** Runs a command on a view: one dispatch (one undo step), focus returns to the editor. */
export function runMdCommand(view:EditorView,cmd:MdCommand,opts:{lang?:string}={}){
 if(view.state.readOnly)return false;const tr=mdTransaction(view.state,cmd,opts);if(!tr)return false;view.dispatch(tr,{scrollIntoView:true});view.focus();return true;}
/** Inserts [text](url). Only called after the user confirmed the dialog. The range is the selection saved when the dialog opened. */
export function insertLink(view:EditorView,text:string,url:string,range?:{from:number;to:number}){
 const len=view.state.doc.length;const from=Math.min(range?.from??view.state.selection.main.from,len),to=Math.min(range?.to??view.state.selection.main.to,len);
 const safe=url.trim().replace(/[()\s]/g,c=>c===' '?'%20':c==='('?'%28':'%29');const md=`[${text.replace(/([\[\]\\])/g,'\\$1')}](${safe})`;
 view.dispatch({changes:{from,to,insert:md},selection:EditorSelection.cursor(from+md.length),userEvent:'input.format',scrollIntoView:true});view.focus();}
