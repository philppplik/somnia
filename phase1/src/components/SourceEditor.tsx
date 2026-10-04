import {tags} from '@lezer/highlight';
import {useEffect,useRef,useState} from 'react';
import {EditorState,Compartment} from '@codemirror/state';
import {EditorView,keymap,lineNumbers,highlightActiveLine,drawSelection} from '@codemirror/view';
import {defaultKeymap,indentWithTab,undo,redo,selectAll,copyLineDown} from '@codemirror/commands';
import {syntaxHighlighting,HighlightStyle} from '@codemirror/language';
import {autocompletion,closeBrackets,closeBracketsKeymap,completionKeymap} from '@codemirror/autocomplete';
import {search,searchKeymap,highlightSelectionMatches} from '@codemirror/search';
import {linter,lintGutter,type Diagnostic} from '@codemirror/lint';
import {syntaxTree} from '@codemirror/language';
import type {EditorPrefs} from '../lib/editorPrefs';
import {abbreviationTracker,expandAbbreviation} from '@emmetio/codemirror6-plugin';
import {html} from '@codemirror/lang-html';
import {css} from '@codemirror/lang-css';
import {javascript} from '@codemirror/lang-javascript';
import {applyOperations,patchState,getState,useAppStore} from '../store/appStore';
import type {EditorNode} from '../lib/editorPort';
/** Syntax lint: reports parser error nodes from the language tree, no network, no code execution. */
const syntaxLint=linter(view=>{const out:Diagnostic[]=[];const VOID=/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i,OPTIONAL=/^(p|li|dt|dd|tr|td|th|thead|tbody|tfoot|option|optgroup|colgroup|html|head|body)$/i;
 syntaxTree(view.state).iterate({enter:n=>{if(n.name==='Element'&&out.length<50){const kids=[];for(let c=n.node.firstChild;c;c=c.nextSibling)kids.push(c);const open=kids.find(k=>k.name==='OpenTag');const tag=open?view.state.sliceDoc(open.from,open.to).match(/^<\s*([A-Za-z][\w:-]*)/)?.[1]:undefined;if(open&&tag&&!VOID.test(tag)&&!OPTIONAL.test(tag)&&!kids.some(k=>k.name==='CloseTag'||k.name==='SelfClosingTag'||k.name==='MismatchedCloseTag')&&!/\/\s*>$/.test(view.state.sliceDoc(open.from,open.to)))out.push({from:open.from,to:open.to,severity:'warning',message:`Missing closing tag </${tag}>.`});}
 if(n.type.isError&&out.length<50)out.push({from:n.from,to:Math.max(n.to,Math.min(n.from+1,view.state.doc.length)),severity:'error',message:'Syntax problem here (unclosed or unexpected token).'});}});return out;},{delay:400});
/** Ctrl/Cmd+D like Dreamweaver and VS Code: duplicate the selection after itself, or the current line when nothing is selected. */
const duplicateSelectionOrLine=(view:EditorView)=>{const sel=view.state.selection.main;if(sel.empty)return copyLineDown(view);const text=view.state.sliceDoc(sel.from,sel.to);view.dispatch({changes:{from:sel.to,insert:text},selection:{anchor:sel.to,head:sel.to+text.length},userEvent:'input'});return true;};
/** Copy and cut write plain text only. Native copy also puts styled HTML on the clipboard, and Windows adds the source page (https://tauri.localhost) to it, which shows up when pasting into rich-text apps. */
const plainClipboard=EditorView.domEventHandlers({
 copy(e,view){return writePlain(e,view,false);},cut(e,view){return writePlain(e,view,true);}});
function writePlain(e:ClipboardEvent,view:EditorView,cut:boolean){
 if(!e.clipboardData)return false;const st=view.state;const ranges=st.selection.ranges.filter(r=>!r.empty);
 const spans=ranges.length?ranges.map(r=>({from:r.from,to:r.to,text:st.sliceDoc(r.from,r.to)})):[...new Set(st.selection.ranges.map(r=>st.doc.lineAt(r.head).number))].map(n=>{const l=st.doc.line(n);return{from:l.from,to:Math.min(st.doc.length,l.to+1),text:l.text+'\n'};});
 e.clipboardData.setData('text/plain',spans.map(x=>x.text).join('\n'));e.preventDefault();
 if(cut&&!view.state.readOnly)view.dispatch({changes:spans.map(x=>({from:x.from,to:x.to})),userEvent:'delete.cut'});return true;}
const intelligence=(prefs:EditorPrefs)=>[...(prefs.autocomplete?[autocompletion({activateOnTyping:true,icons:false})]:[]),...(prefs.closeBrackets?[closeBrackets()]:[]),...(prefs.lint?[syntaxLint,lintGutter()]:[]),...(prefs.emmet?[abbreviationTracker()]:[])];
const language=(file:string,closeTags=true)=>/\.html?$/i.test(file)?html({autoCloseTags:closeTags}):/\.css$/i.test(file)?css():/\.[jt]sx?$/i.test(file)?javascript({jsx:true,typescript:/\.tsx?$/.test(file)}):[];
export function SourceEditor({source,file,disabled}:{source:string;file:string;disabled:boolean}){
 const wrap=useAppStore().wrapLines;const prefs=useAppStore().editorPrefs;const host=useRef<HTMLDivElement>(null),view=useRef<EditorView|null>(null),latest=useRef({source,file,disabled}),syncing=useRef(false),config=useRef(new Compartment());latest.current={source,file,disabled};
 useEffect(()=>{if(!host.current)return;
 const v=new EditorView({parent:host.current,state:EditorState.create({doc:latest.current.source,extensions:[syntaxHighlighting(HighlightStyle.define([{tag:tags.tagName,color:'var(--syntax-tag)'},{tag:[tags.keyword,tags.attributeName],color:'var(--syntax-keyword)'},{tag:[tags.string,tags.attributeValue],color:'var(--syntax-string)'},{tag:tags.comment,color:'var(--text-tertiary)'},{tag:tags.number,color:'var(--syntax-number)'},{tag:tags.propertyName,color:'var(--syntax-tag)'}])),lineNumbers(),highlightActiveLine(),drawSelection(),config.current.of([language(latest.current.file,getState().editorPrefs.closeTags),...intelligence(getState().editorPrefs),EditorView.editable.of(!latest.current.disabled),...(getState().wrapLines?[EditorView.lineWrapping]:[])]),EditorView.contentAttributes.of({'aria-label':'Source code','data-core-editor':'true'}),plainClipboard,search({top:true}),highlightSelectionMatches(),keymap.of([{key:'Tab',run:v=>getState().editorPrefs.emmet&&/\.(html?|css)$/i.test(latest.current.file)?expandAbbreviation(v):false},{key:'Mod-d',run:duplicateSelectionOrLine,preventDefault:true},...completionKeymap,...closeBracketsKeymap,...searchKeymap,indentWithTab,...defaultKeymap]),EditorView.updateListener.of(update=>{if(update.selectionSet||update.docChanged){const head=update.state.selection.main.head,l=update.state.doc.lineAt(head);const st=getState();if(st.cursorLine!==l.number||st.cursorCol!==head-l.from+1)patchState({cursorLine:l.number,cursorCol:head-l.from+1});}if(!update.docChanged||syncing.current)return;try{applyOperations([{type:'replaceSource',file:latest.current.file,text:update.state.doc.toString()}],'code',`code:${latest.current.file}`);}catch(error){patchState({notice:`Source edit rejected: ${String(error)}. Draft remains in source editor; review before continuing.`});}}),EditorView.theme({'&':{height:'100%',backgroundColor:'var(--bg-base)',color:'var(--text-primary)'},'.cm-scroller':{overflow:'auto',fontFamily:'var(--mono)',fontSize:'var(--editor-font-size,12px)',lineHeight:'var(--editor-line-height,1.5)'},'.cm-content':{padding:'12px 0'},'.cm-gutters':{backgroundColor:'var(--bg-panel)',color:'var(--text-tertiary)',border:'none'},'.cm-tooltip':{backgroundColor:'var(--bg-elevated)',border:'1px solid var(--border-default)',borderRadius:'8px',color:'var(--text-primary)',overflow:'hidden'},'.cm-tooltip-autocomplete ul li[aria-selected]':{backgroundColor:'var(--accent-soft)',color:'var(--text-primary)'},'.cm-completionDetail':{color:'var(--text-tertiary)'},'.cm-panels':{backgroundColor:'var(--bg-panel)',color:'var(--text-primary)'},'.cm-activeLine':{backgroundColor:'var(--bg-hover)'},'.cm-cursor':{borderLeftColor:'var(--accent)'},'&.cm-focused .cm-selectionBackground':{backgroundColor:'var(--accent-soft)'}})]})});view.current=v;return()=>{v.destroy();view.current=null;};},[]);
 useEffect(()=>{const v=view.current;if(!v)return;syncing.current=true;try{const current=v.state.doc.toString();if(current!==source){let from=0;while(from<current.length&&from<source.length&&current[from]===source[from])from++;let a=current.length,b=source.length;while(a>from&&b>from&&current[a-1]===source[b-1]){a--;b--;}v.dispatch({changes:{from,to:a,insert:source.slice(from,b)}});}v.dispatch({effects:config.current.reconfigure([language(file,prefs.closeTags),...intelligence(prefs),EditorView.editable.of(!disabled),...(wrap?[EditorView.lineWrapping]:[])])});}finally{syncing.current=false;}},[source,file,disabled,wrap,prefs]);
 const selectedId=useAppStore().selectedElementId;
 /** Selection sync WYSIWYG/layers -> code: select the element's source range, scroll it into view and focus the editor. */
 useEffect(()=>{const v=view.current,st=getState();if(!v||!selectedId||st.designFile!==file)return;
  let hit:EditorNode|undefined;const walk=(ns:EditorNode[])=>ns.forEach(n=>{if(n.id===selectedId)hit=n;walk(n.children);});walk(st.nodes);
  if(!hit)return;const len=v.state.doc.length;const from=Math.min(hit.from,len),to=Math.min(hit.to,len);
  v.dispatch({selection:{anchor:from,head:to},effects:EditorView.scrollIntoView(from,{y:'center'})});
  if(host.current&&host.current.offsetParent!==null)v.focus();},[selectedId,file]);
 const [menu,setMenu]=useState<{x:number;y:number}|null>(null);const menuRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!menu)return;menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();const close=()=>setMenu(null);const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){close();view.current?.focus();}};const down=(e:PointerEvent)=>{if(!menuRef.current?.contains(e.target as Node))close();};window.addEventListener('keydown',key);window.addEventListener('pointerdown',down);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',down);};},[menu]);
 const act=(fn:(v:EditorView)=>void|Promise<void>)=>async()=>{const v=view.current;setMenu(null);if(!v)return;try{await fn(v);}catch{patchState({notice:'The browser blocked clipboard access. Use the keyboard shortcut instead.'});}v.focus();};
 const sel=()=>{const v=view.current;return !!v&&!v.state.selection.main.empty;};
 const items:Array<[string,string,()=>void,boolean]>=[
  ['Undo','Ctrl+Z',act(v=>{undo(v);}),disabled],['Redo','Ctrl+Y',act(v=>{redo(v);}),disabled],
  ['Cut','Ctrl+X',act(async v=>{const r=v.state.selection.main;await navigator.clipboard.writeText(v.state.sliceDoc(r.from,r.to));v.dispatch({changes:{from:r.from,to:r.to},selection:{anchor:r.from}});}),disabled||!sel()],
  ['Copy','Ctrl+C',act(async v=>{const r=v.state.selection.main;await navigator.clipboard.writeText(v.state.sliceDoc(r.from,r.to));}),!sel()],
  ['Paste','Ctrl+V',act(async v=>{const t=await navigator.clipboard.readText();v.dispatch(v.state.replaceSelection(t));}),disabled],
  ['Select all','Ctrl+A',act(v=>{selectAll(v);}),false]];
 return <><div className="codemirror-host" ref={host} onContextMenu={e=>{e.preventDefault();setMenu({x:Math.min(e.clientX,window.innerWidth-190),y:Math.min(e.clientY,window.innerHeight-230)});}}/>{menu&&<div ref={menuRef} role="menu" aria-label="Code editor actions" className="menu-popup" style={{position:'fixed',left:menu.x,top:menu.y,minWidth:180}}>{items.map(([label,hint,fn,off])=><button key={label} role="menuitem" className="menu-item flex justify-between gap-6" style={{width:'100%',background:'none',border:0,textAlign:'left'}} disabled={off} onClick={fn}><span>{label}</span><kbd className="text-ink-2">{hint}</kbd></button>)}</div>}</>;
}
