import {html} from '@codemirror/lang-html';
import {css} from '@codemirror/lang-css';
import {javascript} from '@codemirror/lang-javascript';
import {json} from '@codemirror/lang-json';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {Prec} from '@codemirror/state';
import {keymap} from '@codemirror/view';
import {insertNewline} from '@codemirror/commands';
import {HighlightStyle,StreamLanguage,type StreamParser} from '@codemirror/language';
import type {Extension} from '@codemirror/state';
import {tags} from '@lezer/highlight';
/** Which editor mode a project file gets. Pure name check so it can be tested without an editor. */
export type EditorMode='html'|'css'|'javascript'|'typescript'|'json'|'tex'|'markdown'|'plain';
export function modeFor(file:string):EditorMode{
 if(/\.html?$/i.test(file))return 'html';
 if(/\.(md|markdown)$/i.test(file))return 'markdown';
 if(/\.css$/i.test(file))return 'css';
 if(/\.(jsonc?|webmanifest|map)$/i.test(file)||/(^|\/)\.(babelrc|eslintrc|prettierrc)$/i.test(file))return 'json';
 if(/\.tex$/i.test(file))return 'tex';
 if(/\.tsx?$/i.test(file))return 'typescript';
 if(/\.(jsx?|mjs|cjs)$/i.test(file))return 'javascript';
 return 'plain';}
/** LaTeX highlighting: % comments, \commands, \begin/\end, and math ($..$, $$..$$, \[..\], \(..\)) as one colour. Stream-based, so it is cheap on big files. */
const MATH_ENV='(?:equation|align|gather|multline|eqnarray|displaymath|math)\\*?';
interface TexState{math:''|'$'|'$$'|'\\['|'\\('|'env';}
const texParser:StreamParser<TexState>={
 name:'latex',startState:()=>({math:''}),
 token(stream,state){
  if(state.math){
   const close={'$':'$','$$':'$$','\\[':'\\]','\\(':'\\)',env:''}[state.math];
   while(!stream.eol()){
    if(state.math==='env'&&stream.match(new RegExp('^\\\\end\\{'+MATH_ENV+'\\}'),false)){if(stream.pos>stream.start)return 'atom';stream.match(new RegExp('^\\\\end\\{'+MATH_ENV+'\\}'));state.math='';return 'keyword';}
    if(state.math==='env'){if(stream.peek()==='\\\\'&&!stream.match(/^\\\\end\\{/,false)){stream.next();stream.next();continue;}stream.next();continue;}
    if(stream.peek()==='\\'){stream.next();stream.next();continue;}
    if(stream.match(close)){state.math='';return 'atom';}
    stream.next();}
   return 'atom';}
  if(stream.eatSpace())return null;
  const c=stream.peek();
  if(c==='%'){stream.skipToEnd();return 'comment';}
  if(c==='$'){stream.next();state.math=stream.eat('$')?'$$':'$';return 'atom';}
  if(c==='\\'){
   if(stream.match('\\[')){state.math='\\[';return 'atom';}
   if(stream.match('\\(')){state.math='\\(';return 'atom';}
   if(stream.match(new RegExp('^\\\\begin\\{'+MATH_ENV+'\\}'))){state.math='env';return 'keyword';}
   if(stream.match(/^\\(?:begin|end)\b/))return 'keyword';
   if(stream.match(/^\\[a-zA-Z]+\*?/))return 'tagName';
   stream.next();stream.next();return 'tagName';}
  stream.next();return null;},
 languageData:{commentTokens:{line:'%'},closeBrackets:{brackets:['(','[','{','$']}}};
const texLanguage=StreamLanguage.define(texParser);
/** CodeMirror language support for a file. Unknown types stay plain text. */
export function languageFor(file:string,closeTags=true):Extension{
 switch(modeFor(file)){
  case 'html':return html({autoCloseTags:closeTags});
  case 'css':return css();
  case 'markdown':return markdown({base:markdownLanguage});
  case 'json':return json();
  case 'typescript':return javascript({jsx:/\.tsx$/i.test(file),typescript:true});
  case 'javascript':return javascript({jsx:true});
  case 'tex':return texLanguage;
  default:return [];}}
/** Markdown only key: Enter continues lists and quotes (lang-markdown), Shift+Enter is a plain newline. Bold and italic are app commands (md.bold, md.italic) so users can remap them. */
export const markdownKeys:Extension=Prec.high(keymap.of([{key:'Shift-Enter',run:insertNewline}]));
/** Syntax colours. Uses only the existing --syntax-* theme variables so every code theme keeps working. */
export const highlightStyle=HighlightStyle.define([
 {tag:tags.tagName,color:'var(--syntax-tag)'},
 {tag:[tags.keyword,tags.attributeName,tags.operatorKeyword,tags.controlKeyword,tags.definitionKeyword,tags.modifier,tags.moduleKeyword],color:'var(--syntax-keyword)'},
 {tag:[tags.string,tags.attributeValue,tags.regexp,tags.special(tags.string)],color:'var(--syntax-string)'},
 {tag:[tags.comment,tags.lineComment,tags.blockComment],color:'var(--text-tertiary)',fontStyle:'italic'},
 {tag:[tags.number,tags.bool,tags.null,tags.atom,tags.unit,tags.color],color:'var(--syntax-number)'},
 {tag:[tags.propertyName,tags.function(tags.variableName),tags.function(tags.propertyName),tags.definition(tags.variableName),tags.className,tags.typeName,tags.labelName],color:'var(--syntax-tag)'},
 {tag:[tags.standard(tags.tagName),tags.namespace,tags.macroName],color:'var(--syntax-keyword)'},
 {tag:[tags.heading1,tags.heading2,tags.heading3,tags.heading4,tags.heading5,tags.heading6,tags.heading],color:'var(--syntax-tag)',fontWeight:'700'},
 {tag:tags.strong,fontWeight:'700'},{tag:tags.emphasis,fontStyle:'italic'},{tag:tags.strikethrough,textDecoration:'line-through'},
 {tag:[tags.url],color:'var(--syntax-string)'},{tag:tags.link,color:'var(--accent)',textDecoration:'underline'},
 {tag:[tags.monospace],color:'var(--syntax-number)'},{tag:tags.quote,color:'var(--text-secondary)',fontStyle:'italic'},
 {tag:[tags.processingInstruction,tags.contentSeparator],color:'var(--syntax-keyword)'},
 {tag:[tags.invalid],color:'var(--syntax-keyword)',textDecoration:'underline wavy'}]);
