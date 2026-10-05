import {useEffect,useRef,useState} from 'react';
import {MergeView,goToNextChunk,goToPreviousChunk,getChunks} from '@codemirror/merge';
import {EditorView,lineNumbers} from '@codemirror/view';
import {EditorState} from '@codemirror/state';
import {syntaxHighlighting,HighlightStyle} from '@codemirror/language';
import {tags} from '@lezer/highlight';
import {html} from '@codemirror/lang-html';
import {css} from '@codemirror/lang-css';
import {javascript} from '@codemirror/lang-javascript';
import {Button} from './ui/button';
import {applyOperations,getSavedFile,patchState,useAppStore} from '../store/appStore';
const lang=(f:string)=>/\.html?$/i.test(f)?html():/\.css$/i.test(f)?css():/\.[jt]sx?$/i.test(f)?javascript({jsx:true,typescript:/\.tsx?$/.test(f)}):[];
const hl=syntaxHighlighting(HighlightStyle.define([{tag:tags.tagName,color:'var(--syntax-tag)'},{tag:[tags.keyword,tags.attributeName],color:'var(--syntax-keyword)'},{tag:[tags.string,tags.attributeValue],color:'var(--syntax-string)'},{tag:tags.comment,color:'var(--text-tertiary)'},{tag:tags.number,color:'var(--syntax-number)'},{tag:tags.propertyName,color:'var(--syntax-tag)'}]));
const theme=EditorView.theme({'&':{height:'100%',backgroundColor:'var(--bg-base)',color:'var(--text-primary)'},'.cm-scroller':{overflow:'auto',fontFamily:'var(--mono)',fontSize:'var(--editor-font-size,12px)',lineHeight:'var(--editor-line-height,1.5)'},'.cm-gutters':{backgroundColor:'var(--bg-panel)',color:'var(--text-tertiary)',border:'none'}});
/** In-editor diff split. Left: a read-only base (last saved version or another project file). Right: the live, editable current file. Edits on the right go through the same replaceSource path as the normal editor, so undo and save behave as usual. */
export function DiffSplit({file}:{file:string}){
 const s=useAppStore();const names=Object.keys(s.files);const [base,setBase]=useState(`saved:${file}`);
 const host=useRef<HTMLDivElement>(null),mv=useRef<MergeView|null>(null),syncing=useRef(false);const [stats,setStats]=useState('');
 const baseText=base.startsWith('saved:')?getSavedFile(base.slice(6)):(s.files[base.slice(5)]??'');
 const current=s.files[file]??'';const latest=useRef({file});latest.current={file};
 const count=()=>{const m=mv.current;if(!m)return;const c=getChunks(m.b.state)?.chunks.length??0;setStats(c===0?'No differences.':`${c} change${c===1?'':'s'}`);};
 useEffect(()=>{if(!host.current)return;
  const common=[lineNumbers(),hl,theme,lang(file),EditorView.lineWrapping];
  const m=new MergeView({parent:host.current,a:{doc:baseText,extensions:[...common,EditorState.readOnly.of(true),EditorView.editable.of(false),EditorView.contentAttributes.of({'aria-label':'Diff base'})]},
   b:{doc:current,extensions:[...common,EditorView.contentAttributes.of({'aria-label':'Source code (diff split)','data-core-editor':'true'}),EditorView.updateListener.of(u=>{if(!u.docChanged||syncing.current)return;try{applyOperations([{type:'replaceSource',file:latest.current.file,text:u.state.doc.toString()}],'code',`code:${latest.current.file}`);}catch(error){patchState({notice:`Source edit rejected: ${String(error)}.`});}count();})]},
   highlightChanges:true,gutter:true});
  mv.current=m;count();return()=>{m.destroy();mv.current=null;};
 },[file,base]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{const m=mv.current;if(!m)return;const doc=m.b.state.doc.toString();if(doc===current)return;syncing.current=true;try{m.b.dispatch({changes:{from:0,to:doc.length,insert:current}});}finally{syncing.current=false;}count();},[current]);// eslint-disable-line react-hooks/exhaustive-deps
 const opts=[...names.map(n=>({v:`saved:${n}`,label:`Last saved: ${n}`})),...names.filter(n=>n!==file).map(n=>({v:`file:${n}`,label:`File: ${n}`}))];
 return <div className="flex h-full min-h-0 flex-col" aria-label="Diff split">
  <div className="flex items-center gap-2 border-b border-subtle px-3 py-1.5 text-[12px]">
   <label className="flex items-center gap-2">Compare with<select aria-label="Compare with" value={base} onChange={e=>setBase(e.target.value)} className="h-7 rounded-sm border border-subtle bg-panel px-2 text-ink">{opts.map(o=><option key={o.v} value={o.v}>{o.label}</option>)}</select></label>
   <span role="status" aria-label="Diff summary">{stats}</span><span className="flex-1"/>
   <Button onClick={()=>{const m=mv.current;if(m){goToPreviousChunk(m.b);m.b.focus();}}} aria-label="Previous change">Previous</Button>
   <Button onClick={()=>{const m=mv.current;if(m){goToNextChunk(m.b);m.b.focus();}}} aria-label="Next change">Next</Button>
   <Button onClick={()=>patchState({diffSplit:false})} aria-label="Close diff split">Close</Button></div>
  <div ref={host} className="min-h-0 flex-1 overflow-auto" data-testid="diff-split"/></div>;}
