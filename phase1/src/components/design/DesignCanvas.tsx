import {useRef,useState} from 'react';
import {createNode,exportArtboardSVG,parseDesignDocument,serializeDesignDocument,type DesignNode} from '../../lib/design/model';
import {downloadDesign,editDesign,redoDesign,selectDesignNode,startDesign,undoDesign,useDesignState,loadDesign} from '../../lib/design/session';
import {Button} from '../ui/button';
import {StudioEmptyState} from '../studios/StudioEmptyState';

export function DesignCanvas(){
 const s=useDesignState();const input=useRef<HTMLInputElement>(null);const [error,setError]=useState('');const [zoom,setZoom]=useState(0.65);
 const [drag,setDrag]=useState<{id:string;startX:number;startY:number;x:number;y:number;width:number;height:number;dx:number;dy:number;resize:boolean}|null>(null);
 const board=s.document?.artboards.find(a=>a.id===s.artboardId);
 const guardReplace=(action:()=>void)=>{if(!s.dirty||window.confirm('Replace this design? Export the project first to keep your changes.'))action();};
 const add=(kind:DesignNode['kind'])=>{if(!board)return;const node=createNode(kind,board.nodes.length);editDesign(doc=>({...doc,artboards:doc.artboards.map(a=>a.id===board.id?{...a,nodes:[...a.nodes,node]}:a)}));selectDesignNode(node.id);};
 const updateDrag=(event:React.PointerEvent)=>{if(!drag)return;setDrag({...drag,dx:(event.clientX-drag.startX)/zoom,dy:(event.clientY-drag.startY)/zoom});};
 const finishDrag=()=>{if(!drag||!board)return;const d=drag;setDrag(null);editDesign(doc=>({...doc,artboards:doc.artboards.map(a=>a.id===board.id?{...a,nodes:a.nodes.map(n=>n.id===d.id?{...n,...(d.resize?{width:Math.max(8,Math.min(16384,d.width+d.dx)),height:Math.max(8,Math.min(16384,d.height+d.dy))}:{x:Math.max(-32768,Math.min(32768,d.x+d.dx)),y:Math.max(-32768,Math.min(32768,d.y+d.dy))})}:n)}:a)}));};
 const begin=(event:React.PointerEvent,node:DesignNode,resize=false)=>{event.stopPropagation();selectDesignNode(node.id);if(node.locked||event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);setDrag({id:node.id,startX:event.clientX,startY:event.clientY,x:node.x,y:node.y,width:node.width,height:node.height,dx:0,dy:0,resize});};
 return <section data-testid="design-canvas" className="panel flex min-h-0 min-w-0 flex-col overflow-hidden" aria-label="Design Studio" onKeyDown={event=>{
  const target=event.target as HTMLElement;if(target.matches('input,textarea,select')||target.isContentEditable)return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();if(event.shiftKey)redoDesign();else undoDesign();}
  if(event.key==='Delete'&&board&&s.selection){event.preventDefault();editDesign(doc=>({...doc,artboards:doc.artboards.map(a=>a.id===board.id?{...a,nodes:a.nodes.filter(n=>n.id!==s.selection||n.locked)}:a)}));selectDesignNode(null);}
 }}>
 <input ref={input} data-testid="design-import-input" className="hidden" type="file" accept=".somdesign,application/json" onChange={async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{if(file.size>5_000_000)throw new Error('Design files must be under 5 MB.');const doc=parseDesignDocument(await file.text());guardReplace(()=>loadDesign(doc));setError('');}catch(error){setError(error instanceof Error?error.message:'Could not open design.');}}}/>
 {!board||!s.document?<StudioEmptyState studio="design" icon={<span>▧</span>} onOpen={()=>input.current?.click()} onCreate={startDesign}/>:<>
 <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-subtle p-3">
 <span className="mr-auto text-sm font-medium">{s.document.name}<span className="ml-2 text-xs text-ink-2">{s.dirty?'Unsaved changes':'Opened project'}</span></span>
 <Button size="compact" data-testid="design-open" variant="outline" onClick={()=>input.current?.click()}>Open</Button>
 <Button size="compact" data-testid="design-create-blank" variant="outline" onClick={()=>guardReplace(startDesign)}>New</Button>
 <Button size="compact" data-testid="design-add-rectangle" onClick={()=>add('rectangle')}>Rectangle</Button><Button size="compact" data-testid="design-add-text" onClick={()=>add('text')}>Text</Button>
 <Button size="compact" data-testid="design-undo" disabled={!s.past.length} onClick={undoDesign}>Undo</Button><Button size="compact" data-testid="design-redo" disabled={!s.future.length} onClick={redoDesign}>Redo</Button>
 <label className="text-xs">Zoom <select aria-label="Design zoom" value={zoom} onChange={e=>setZoom(Number(e.target.value))} className="rounded bg-hover p-1">{[0.25,0.5,0.65,0.75,1,1.5].map(z=><option key={z} value={z}>{Math.round(z*100)}%</option>)}</select></label>
 <Button size="compact" data-testid="design-export-project" variant="outline" onClick={()=>downloadDesign(`${s.document!.name}.somdesign`,serializeDesignDocument(s.document!),'application/json')}>Export project</Button>
 <Button size="compact" data-testid="design-export-svg" variant="outline" onClick={()=>downloadDesign(`${board.name}.svg`,exportArtboardSVG(board),'image/svg+xml')}>Export SVG</Button>
 </div>
 <div className="min-h-0 flex-1 overflow-auto bg-hover p-10" onPointerDown={()=>selectDesignNode(null)}>
 <div style={{width:board.width*zoom,height:board.height*zoom,margin:'0 auto'}}>
 <div data-testid="design-artboard" aria-label={board.name} className="relative origin-top-left shadow-lg" style={{width:board.width,height:board.height,transform:`scale(${zoom})`,background:board.background,overflow:'hidden'}}>
 {board.nodes.filter(n=>!n.hidden).map(node=>{const d=drag?.id===node.id?drag:null;const selected=s.selection===node.id;return <div key={node.id} data-testid={`design-layer-${node.id}`} role="button" aria-label={node.name} aria-pressed={selected} tabIndex={0} onFocus={()=>selectDesignNode(node.id)} onPointerDown={e=>begin(e,node)} onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={()=>setDrag(null)} className="absolute touch-none select-none" style={{left:node.x+(d&&!d.resize?d.dx:0),top:node.y+(d&&!d.resize?d.dy:0),width:Math.max(8,node.width+(d?.resize?d.dx:0)),height:Math.max(8,node.height+(d?.resize?d.dy:0)),background:node.kind==='rectangle'?node.fill:'transparent',color:node.fill,borderRadius:node.radius,fontSize:node.fontSize,lineHeight:1.2,fontFamily:'sans-serif',whiteSpace:'pre',cursor:node.locked?'default':'move',outline:selected?'2px solid var(--accent, #7756e8)':'none',outlineOffset:2}}>
 {node.kind==='text'&&<div className="h-full overflow-hidden">{node.text}</div>}
 {selected&&!node.locked&&<button aria-label={`Resize ${node.name}`} className="absolute -bottom-1.5 -right-1.5 size-3 border-2 border-white bg-accent" style={{cursor:'nwse-resize'}} onPointerDown={e=>begin(e,node,true)} onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={()=>setDrag(null)}/>}
 </div>;})}
 </div></div></div>
 </>}
 {error&&<p role="alert" className="border-t border-subtle p-3 text-sm text-red-600">{error}</p>}
 </section>;
}
