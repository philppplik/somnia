import {useEffect,useRef} from 'react';
import {EditorState,Compartment} from '@codemirror/state';
import {EditorView,keymap,lineNumbers,highlightActiveLine,drawSelection} from '@codemirror/view';
import {defaultKeymap,indentWithTab} from '@codemirror/commands';
import {syntaxHighlighting,defaultHighlightStyle} from '@codemirror/language';
import {html} from '@codemirror/lang-html';
import {css} from '@codemirror/lang-css';
import {javascript} from '@codemirror/lang-javascript';
import {applyOperations,patchState} from '../store/appStore';
const language=(file:string)=>/\.html?$/i.test(file)?html():/\.css$/i.test(file)?css():/\.[jt]sx?$/i.test(file)?javascript({jsx:true,typescript:/\.tsx?$/.test(file)}):[];
export function SourceEditor({source,file,disabled}:{source:string;file:string;disabled:boolean}){
 const host=useRef<HTMLDivElement>(null),view=useRef<EditorView|null>(null),latest=useRef({source,file,disabled}),syncing=useRef(false),config=useRef(new Compartment());latest.current={source,file,disabled};
 useEffect(()=>{if(!host.current)return;
 const v=new EditorView({parent:host.current,state:EditorState.create({doc:latest.current.source,extensions:[syntaxHighlighting(defaultHighlightStyle),lineNumbers(),highlightActiveLine(),drawSelection(),config.current.of([language(latest.current.file),EditorView.editable.of(!latest.current.disabled)]),EditorView.contentAttributes.of({'aria-label':'Source code','data-core-editor':'true'}),keymap.of([indentWithTab,...defaultKeymap]),EditorView.updateListener.of(update=>{if(!update.docChanged||syncing.current)return;try{applyOperations([{type:'replaceSource',file:latest.current.file,text:update.state.doc.toString()}],'code',`code:${latest.current.file}`);}catch(error){patchState({notice:`Source edit rejected: ${String(error)}. Draft remains in source editor; review before continuing.`});}}),EditorView.theme({'&':{height:'100%',backgroundColor:'var(--bg-base)',color:'var(--text-primary)'},'.cm-scroller':{overflow:'auto',fontFamily:'var(--mono)',fontSize:'12px'},'.cm-content':{padding:'12px 0'},'.cm-gutters':{backgroundColor:'var(--bg-panel)',color:'var(--text-tertiary)',border:'none'},'.cm-activeLine':{backgroundColor:'var(--bg-hover)'},'.cm-cursor':{borderLeftColor:'var(--accent)'},'&.cm-focused .cm-selectionBackground':{backgroundColor:'var(--accent-soft)'}})]})});view.current=v;return()=>{v.destroy();view.current=null;};},[]);
 useEffect(()=>{const v=view.current;if(!v)return;syncing.current=true;try{const current=v.state.doc.toString();if(current!==source){let from=0;while(from<current.length&&from<source.length&&current[from]===source[from])from++;let a=current.length,b=source.length;while(a>from&&b>from&&current[a-1]===source[b-1]){a--;b--;}v.dispatch({changes:{from,to:a,insert:source.slice(from,b)}});}v.dispatch({effects:config.current.reconfigure([language(file),EditorView.editable.of(!disabled)])});}finally{syncing.current=false;}},[source,file,disabled]);
 return <div className="codemirror-host" ref={host}/>;
}
