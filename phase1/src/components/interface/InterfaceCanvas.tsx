import {useEffect,useMemo,useRef,useState,type PointerEvent,type ReactNode} from 'react';
import {computeInterfaceLayout} from '../../lib/interface/layout';
import {componentDiagnostics,owningInstance,patchInterfaceNode} from '../../lib/interface/components';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {interfaceSession,startInterface,useInterfaceState} from '../../lib/interface/session';
import {MAX_BYTES,parseInterfaceDocument,type InterfaceNode} from '../../lib/interface/model';
import {registerInterfaceCommands} from '../../lib/interface/commands';
import {studioContextStore} from '../../lib/shell/studioContext';
import {applyInterfaceGesture,type InterfaceGesture as Drag} from '../../lib/interface/gesture';
export function InterfaceCanvas(){
 const s=useInterfaceState();const {t}=useT();const [zoom,setZoom]=useState(.75);const [drag,setDrag]=useState<Drag|null>(null);const [error,setError]=useState('');const input=useRef<HTMLInputElement>(null);const claim=useRef<ReturnType<typeof studioContextStore.claim>|null>(null);
 const doc=s.document;const computed=useMemo(()=>doc?computeInterfaceLayout(doc):null,[doc]);const diagnostics=useMemo(()=>doc?[...(computed?.diagnostics??[]),...componentDiagnostics(doc).map(d=>d.message)]:[],[doc,computed]);const page=doc?.pages.find(p=>p.id===s.pageId);
 useEffect(()=>{interfaceSession.recover();return registerInterfaceCommands();},[]);
 useEffect(()=>{const c=studioContextStore.claim('interface');claim.current=c;return()=>{c.release();claim.current=null;};},[]);
 useEffect(()=>{const node=doc?.nodes.find(n=>n.id===s.selection);claim.current?.report({document:doc?{id:doc.id,kind:'somnia-interface',dirty:s.dirty,readOnly:false}:undefined,selection:{kind:node?'one':'none',count:node?1:0,ids:node?[node.id]:[],type:node?.kind},mode:'edit',busy:false,activeTool:'select',data:{pageId:s.pageId,revision:doc?.revision??0},services:{ready:!!doc,canUndo:!!s.past.length,canRedo:!!s.future.length}});},[s]);
 const safe=(f:()=>void)=>{try{f();setError('');}catch(e){setError(e instanceof Error?e.message:'Invalid edit.');}};
 const begin=(e:PointerEvent,n:InterfaceNode,resize=false)=>{e.stopPropagation();interfaceSession.select(n.id);if(e.button!==0||n.locked||!doc)return;const parent=doc.nodes.find(p=>p.id===n.parentId);const owner=owningInstance(doc,n.id);if(owner&&owner.id!==n.id||parent?.layout&&parent.layout.direction!=='free'&&!n.sizing?.absolute)return;e.currentTarget.setPointerCapture(e.pointerId);setDrag({id:n.id,revision:doc.revision,startX:e.clientX,startY:e.clientY,x:computed?.bounds.get(n.id)?.x??n.x,y:computed?.bounds.get(n.id)?.y??n.y,width:computed?.bounds.get(n.id)?.width??n.width,height:computed?.bounds.get(n.id)?.height??n.height,dx:0,dy:0,resize});};
 const finish=()=>{const d=drag;setDrag(null);if(!d||interfaceSession.get().document?.revision!==d.revision)return;safe(()=>interfaceSession.transact(doc=>{applyInterfaceGesture(doc,d);}));}; const layer=(id:string):ReactNode=>{const n=doc!.nodes.find(n=>n.id===id)!;if(n.hidden)return null;const geometry=computed?.bounds.get(id)??n;const d=drag?.id===id?drag:null;const selected=s.selection===id;return <div key={id} data-testid={`interface-node-${id}`} role="button" aria-label={n.name} aria-pressed={selected} tabIndex={0} onFocus={e=>{if(e.target===e.currentTarget)interfaceSession.select(id);}} onPointerDown={e=>begin(e,n)} onPointerMove={e=>{if(d){e.stopPropagation();setDrag({...d,dx:(e.clientX-d.startX)/zoom,dy:(e.clientY-d.startY)/zoom});}}} onPointerUp={e=>{if(d){e.stopPropagation();finish();}}} onPointerCancel={()=>setDrag(null)} className="absolute touch-none select-none" style={{left:geometry.x+(d&&!d.resize?d.dx:0),top:geometry.y+(d&&!d.resize?d.dy:0),width:Math.max(1,geometry.width+(d?.resize?d.dx:0)),height:Math.max(1,geometry.height+(d?.resize?d.dy:0)),background:n.kind==='text'||n.kind==='group'?'transparent':n.fill,color:n.fill,outline:selected?'2px solid var(--accent)':'none',outlineOffset:2,overflow:n.kind==='frame'?'hidden':undefined,cursor:n.locked?'default':'move'}}>
  {n.kind==='text'&&<div style={{fontSize:16,lineHeight:1.25,whiteSpace:'pre-wrap',overflow:'hidden',height:'100%'}}>{n.text}</div>}
  {n.children.map(layer)}
  {selected&&!n.locked&&<button className="absolute bottom-0 right-0 size-3 border border-subtle bg-accent" style={{cursor:'nwse-resize'}} aria-label={t('interface.resize',{name:n.name})} onPointerDown={e=>begin(e,n,true)}/>}
 </div>;};
 return <section data-testid="interface-canvas" aria-label={t('studio.interface')} className="panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" onKeyDown={e=>{
  const el=e.target as HTMLElement;if(el.matches('input,textarea,select')||el.isContentEditable)return;
  if(e.key==='Escape'){setDrag(null);return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();setDrag(null);if(e.shiftKey)interfaceSession.redo();else interfaceSession.undo();return;}
  if(e.key==='Enter'||e.key===' '){const node=el.closest('[data-testid^="interface-node-"]');if(node){e.preventDefault();interfaceSession.select(node.getAttribute('data-testid')!.slice('interface-node-'.length));}}
  const delta:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(delta[e.key]&&s.selection){e.preventDefault();const [x,y]=delta[e.key];safe(()=>interfaceSession.transact(d=>{const n=d.nodes.find(n=>n.id===s.selection);if(n&&!n.locked){const parent=d.nodes.find(p=>p.id===n.parentId);if(parent?.layout&&parent.layout.direction!=='free'&&!n.sizing?.absolute)throw Error('Reorder stacked layers or set Absolute child before moving.');patchInterfaceNode(d,n.id,{x:n.x+x*(e.shiftKey?10:1),y:n.y+y*(e.shiftKey?10:1)});}}));}
 }}>
  <input className="hidden" ref={input} type="file" accept="application/json,.json" aria-label={t('interface.open')} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>MAX_BYTES)throw Error('Interface snapshot exceeds 5 MB.');const next=parseInterfaceDocument(await file.text());if(interfaceSession.get().dirty&&!window.confirm(t('interface.replace')))return;setDrag(null);interfaceSession.load(next);setError('');}catch(error){setError(error instanceof Error?error.message:'Invalid snapshot.');}}}/>
  {!page||!doc?<div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center"><h1 className="text-xl font-semibold">{t('interface.title')}</h1><p className="max-w-md text-sm text-ink-2">{t('interface.description')}</p><div className="flex flex-wrap justify-center gap-2"><Button variant="primary" onClick={startInterface}>{t('interface.new')}</Button><Button variant="outline" onClick={()=>input.current?.click()}>{t('interface.open')}</Button></div></div>:<>
   <div className="min-h-0 flex-1 overflow-auto bg-hover p-8" onPointerDown={e=>{if(e.target===e.currentTarget)interfaceSession.select(null);}}>
    <div className="relative origin-top-left" style={{width:Math.max(1600,...doc.nodes.filter(n=>n.pageId===page.id&&!n.parentId).map(n=>{const b=computed!.bounds.get(n.id)!;return b.x+b.width+64;}))*zoom,height:Math.max(1000,...doc.nodes.filter(n=>n.pageId===page.id&&!n.parentId).map(n=>{const b=computed!.bounds.get(n.id)!;return b.y+b.height+64;}))*zoom}}>
     <div className="absolute origin-top-left" style={{width:'100%',height:'100%',transform:`scale(${zoom})`}}>{page.children.map(layer)}</div>
    </div>
   </div>
   <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-subtle px-3 py-2 text-xs text-ink-2"><span className="mr-auto truncate">{page.name}</span><label>{t('interface.zoom')} <select aria-label={t('interface.zoom')} value={zoom} className="rounded bg-panel p-1" onChange={e=>{setDrag(null);setZoom(Number(e.target.value));}}>{[.25,.5,.75,1,1.5,2].map(z=><option key={z} value={z}>{Math.round(z*100)}%</option>)}</select></label><Button size="compact" variant="ghost" onClick={()=>input.current?.click()}>{t('interface.open')}</Button><span role="status">{s.dirty?t('interface.unsaved'):t('interface.saved')}</span></footer>
  </>}
  {diagnostics.length>0&&<details className="border-t border-subtle px-3 py-2 text-xs text-ink-2"><summary>{t("interface.diagnostics")} ({diagnostics.length})</summary><ul>{diagnostics.slice(0,20).map((d,i)=><li key={i}>{d}</li>)}</ul></details>}
  {s.notice&&<p role="status" className="m-0 border-t border-subtle p-3 text-xs text-ink-2">{s.notice}</p>}
  {(error||s.recoveryError)&&<p role="alert" className="m-0 border-t border-subtle p-3 text-xs text-ink">{error||s.recoveryError}</p>}
 </section>;
}
