import {html} from '@codemirror/lang-html';
import {css} from '@codemirror/lang-css';
import {javascript} from '@codemirror/lang-javascript';
import {json} from '@codemirror/lang-json';
import {HighlightStyle} from '@codemirror/language';
import type {Extension} from '@codemirror/state';
import {tags} from '@lezer/highlight';
/** Which editor mode a project file gets. Pure name check so it can be tested without an editor. */
export type EditorMode='html'|'css'|'javascript'|'typescript'|'json'|'plain';
export function modeFor(file:string):EditorMode{
 if(/\.html?$/i.test(file))return 'html';
 if(/\.css$/i.test(file))return 'css';
 if(/\.(jsonc?|webmanifest|map)$/i.test(file)||/(^|\/)\.(babelrc|eslintrc|prettierrc)$/i.test(file))return 'json';
 if(/\.tsx?$/i.test(file))return 'typescript';
 if(/\.(jsx?|mjs|cjs)$/i.test(file))return 'javascript';
 return 'plain';}
/** CodeMirror language support for a file. Unknown types stay plain text. */
export function languageFor(file:string,closeTags=true):Extension{
 switch(modeFor(file)){
  case 'html':return html({autoCloseTags:closeTags});
  case 'css':return css();
  case 'json':return json();
  case 'typescript':return javascript({jsx:/\.tsx$/i.test(file),typescript:true});
  case 'javascript':return javascript({jsx:true});
  default:return [];}}
/** Syntax colours. Uses only the existing --syntax-* theme variables so every code theme keeps working. */
export const highlightStyle=HighlightStyle.define([
 {tag:tags.tagName,color:'var(--syntax-tag)'},
 {tag:[tags.keyword,tags.attributeName,tags.operatorKeyword,tags.controlKeyword,tags.definitionKeyword,tags.modifier,tags.moduleKeyword],color:'var(--syntax-keyword)'},
 {tag:[tags.string,tags.attributeValue,tags.regexp,tags.special(tags.string)],color:'var(--syntax-string)'},
 {tag:[tags.comment,tags.lineComment,tags.blockComment],color:'var(--text-tertiary)',fontStyle:'italic'},
 {tag:[tags.number,tags.bool,tags.null,tags.atom,tags.unit,tags.color],color:'var(--syntax-number)'},
 {tag:[tags.propertyName,tags.function(tags.variableName),tags.function(tags.propertyName),tags.definition(tags.variableName),tags.className,tags.typeName,tags.labelName],color:'var(--syntax-tag)'},
 {tag:[tags.standard(tags.tagName),tags.namespace,tags.macroName],color:'var(--syntax-keyword)'},
 {tag:[tags.invalid],color:'var(--syntax-keyword)',textDecoration:'underline wavy'}]);
