import {tags} from '@lezer/highlight';
import {useEffect,useRef} from 'react';
import {EditorState,Compartment} from '@codemirror/state';
import {EditorView,keymap,lineNumbers,highlightActiveLine,drawSelection} from '@codemirror/view';
import {defaultKeymap,indentWithTab} from '@codemirror/commands';
import {syntaxHighlighting,HighlightStyle} from '@codemirror/language';
import {autocompletion,closeBrackets,closeBracketsKeymap,completionKeymap} from '@codemirror/autocomplete';
import {search,searchKeymap,highlightSelectionMatches} from '@codemirror/search';
import {html} from '@codemirror/lang-html';
import {css} from '@codemirror/lang-css';
import {javascript} from '@codemirror/lang-javascript';
import {applyOperations,patchState,getState,useAppStore} from '../store/appStore';
import type {EditorNode} from '../lib/editorPort';
const language=(file:string)=>/\.html?$/i.test(file)?html():/\.css$/i.test(file)?css():/\.[jt]sx?$/i.test(file)?javascript({jsx:true,typescript:/\.tsx?$/.test(file)}):[];
export function SourceEditor({source,file,disabled}:{source:string;file:string;disabled:boolean}){
 const host=useRef<HTMLDivElement>(null),view=useRef<EditorView|null>(null),latest=useRef({source,file,disabled}),syncing=useRef(false),config=useRef(new Compartment());latest.current={source,file,disabled};
 useEffect(()=>{if(!host.current)return;
 const v=new EditorView({parent:host.current,state:EditorState.create({doc:latest.current.source,extensions:[syntaxHighlighting(HighlightStyle.define([{tag:tags.tagName,color:'var(--syntax-tag)'},{tag:[tags.keyword,tags.attributeName],color:'var(--syntax-keyword)'},{tag:[tags.string,tags.attributeValue],color:'var(--syntax-string)'},{tag:tags.comment,color:'var(--text-tertiary)'},{tag:tags.number,color:'var(--syntax-number)'},{tag:tags.propertyName,color:'var(--syntax-tag)'}])),lineNumbers(),highlightActiveLine(),drawSelection(),config.current.of([language(latest.current.file),EditorView.editable.of(!latest.current.disabled)]),EditorView.contentAttributes.of({'aria-label':'Source code','data-core-editor':'true'}),autocompletion({activateOnTyping:true,icons:false}),closeBrackets(),search({top:true}),highlightSelectionMatches(),keymap.of([...completionKeymap,...closeBracketsKeymap,...searchKeymap,indentWithTab,...defaultKeymap]),EditorView.updateListener.of(update=>{if(update.selectionSet||update.docChanged){const head=update.state.selection.main.head,l=update.state.doc.lineAt(head);const st=getState();if(st.cursorLine!==l.number||st.cursorCol!==head-l.from+1)patchState({cursorLine:l.number,cursorCol:head-l.from+1});}if(!update.docChanged||syncing.current)return;try{applyOperations([{type:'replaceSource',file:latest.current.file,text:update.state.doc.toString()}],'code',`code:${latest.current.file}`);}catch(error){patchState({notice:`Source edit rejected: ${String(error)}. Draft remains in source editor; review before continuing.`});}}),EditorView.theme({'&':{height:'100%',backgroundColor:'var(--bg-base)',color:'var(--text-primary)'},'.cm-scroller':{overflow:'auto',fontFamily:'var(--mono)',fontSize:'12px'},'.cm-content':{padding:'12px 0'},'.cm-gutters':{backgroundColor:'var(--bg-panel)',color:'var(--text-tertiary)',border:'none'},'.cm-tooltip':{backgroundColor:'var(--bg-elevated)',border:'1px solid var(--border-default)',borderRadius:'8px',color:'var(--text-primary)',overflow:'hidden'},'.cm-tooltip-autocomplete ul li[aria-selected]':{backgroundColor:'var(--accent-soft)',color:'var(--text-primary)'},'.cm-completionDetail':{color:'var(--text-tertiary)'},'.cm-panels':{backgroundColor:'var(--bg-panel)',color:'var(--text-primary)'},'.cm-activeLine':{backgroundColor:'var(--bg-hover)'},'.cm-cursor':{borderLeftColor:'var(--accent)'},'&.cm-focused .cm-selectionBackground':{backgroundColor:'var(--accent-soft)'}})]})});view.current=v;return()=>{v.destroy();view.current=null;};},[]);
 useEffect(()=>{const v=view.current;if(!v)return;syncing.current=true;try{const current=v.state.doc.toString();if(current!==source){let from=0;while(from<current.length&&from<source.length&&current[from]===source[from])from++;let a=current.length,b=source.length;while(a>from&&b>from&&current[a-1]===source[b-1]){a--;b--;}v.dispatch({changes:{from,to:a,insert:source.slice(from,b)}});}v.dispatch({effects:config.current.reconfigure([language(file),EditorView.editable.of(!disabled)])});}finally{syncing.current=false;}},[source,file,disabled]);
 const selectedId=useAppStore().selectedElementId;
 /** Selection sync WYSIWYG/layers -> code: select the element's source range, scroll it into view and focus the editor. */
 useEffect(()=>{const v=view.current,st=getState();if(!v||!selectedId||st.designFile!==file)return;
  let hit:EditorNode|undefined;const walk=(ns:EditorNode[])=>ns.forEach(n=>{if(n.id===selectedId)hit=n;walk(n.children);});walk(st.nodes);
  if(!hit)return;const len=v.state.doc.length;const from=Math.min(hit.from,len),to=Math.min(hit.to,len);
  v.dispatch({selection:{anchor:from,head:to},effects:EditorView.scrollIntoView(from,{y:'center'})});
  if(host.current&&host.current.offsetParent!==null)v.focus();},[selectedId,file]);
 return <div className="codemirror-host" ref={host}/>;
}
