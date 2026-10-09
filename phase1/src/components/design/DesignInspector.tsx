import {DesignLayersPanel} from './DesignLayersPanel';
import {DesignInspectorPanel} from './DesignInspectorPanel';
import {designRows,patchDesignNodes,reorderDesignNode,deleteDesignNodes,duplicateDesignNodes} from '../../lib/design/panelAdapter';
import {alignPatches,distributePatches} from '../../lib/design/inspectorModel';
import {useState} from 'react';
import {createArtboard,type Artboard} from '../../lib/design/model';
import {editDesign,selectArtboard,selectDesignNode,useDesignState} from '../../lib/design/session';
import {Button} from '../ui/button';
const fieldClass='w-full rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-sm';
function NumberField({label,value,min,max,onChange}:{label:string;value:number;min:number;max:number;onChange:(n:number)=>void}){
 const [draft,setDraft]=useState<string|null>(null);
 const commit=()=>{if(draft!==null){const n=Number(draft);if(draft.trim()&&Number.isFinite(n))onChange(Math.min(max,Math.max(min,n)));setDraft(null);}};
 return <label className="space-y-1 text-xs text-ink-2">{label}<input className={fieldClass} type="number" aria-label={label} min={min} max={max} value={draft??value} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){commit();e.currentTarget.blur();}if(e.key==='Escape'){setDraft(null);e.currentTarget.blur();}}}/></label>;
}
export function DesignInspector(){
 const s=useDesignState();const board=s.document?.artboards.find(a=>a.id===s.artboardId);
 const updateBoard=(patch:Partial<Artboard>)=>{if(board)editDesign(doc=>({...doc,artboards:doc.artboards.map(a=>a.id===board.id?{...a,...patch}:a)}));};
 return <aside className="panel h-full overflow-auto p-4" data-testid="design-properties" aria-label="Design properties">
 <h2 className="mb-4 text-sm font-semibold">Design properties</h2>
 {!board?<p className="text-sm text-ink-2">Create or open a design project to work with artboards and layers.</p>:<div className="space-y-5">
 <section className="space-y-3"><h3 className="text-xs font-semibold uppercase text-ink-2">Artboards</h3>
 <select aria-label="Active artboard" className={fieldClass} value={board.id} onChange={e=>selectArtboard(e.target.value)}>{s.document!.artboards.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
 <div className="flex gap-2"><Button size="compact" disabled={s.document!.artboards.length>=100} onClick={()=>{const a=createArtboard(`Artboard ${s.document!.artboards.length+1}`);editDesign(doc=>({...doc,artboards:[...doc.artboards,a]}));selectArtboard(a.id);}}>Add artboard</Button><Button size="compact" variant="outline" disabled={s.document!.artboards.length===1} onClick={()=>{const id=s.document!.artboards.find(a=>a.id!==board.id)!.id;editDesign(doc=>({...doc,artboards:doc.artboards.filter(a=>a.id!==board.id)}));selectArtboard(id);}}>Remove</Button></div>
 <label className="block space-y-1 text-xs text-ink-2">Project name<input className={fieldClass} aria-label="Project name" maxLength={200} value={s.document!.name} onChange={e=>editDesign(doc=>({...doc,name:e.target.value}))}/></label>
 <label className="block space-y-1 text-xs text-ink-2">Artboard name<input className={fieldClass} aria-label="Artboard name" maxLength={200} value={board.name} onChange={e=>updateBoard({name:e.target.value})}/></label>
 <div className="grid grid-cols-2 gap-2"><NumberField label="Artboard width" value={board.width} min={1} max={16384} onChange={width=>updateBoard({width})}/><NumberField label="Artboard height" value={board.height} min={1} max={16384} onChange={height=>updateBoard({height})}/></div>
 <label className="flex items-center justify-between text-xs text-ink-2">Background<input type="color" aria-label="Artboard background" value={board.background} onChange={e=>updateBoard({background:e.target.value})}/></label>
 </section>
 <DesignLayersPanel rows={designRows()} selectedIds={s.selectedIds} onSelect={selectDesignNode} onRename={(id,name)=>patchDesignNodes(new Map([[id,{name}]]))} onToggleVisible={(id,visible)=>patchDesignNodes(new Map([[id,{visible}]]),true)} onToggleLocked={(id,locked)=>patchDesignNodes(new Map([[id,{locked}]]),true)} onReorder={reorderDesignNode} onDelete={deleteDesignNodes} onDuplicate={duplicateDesignNodes}/>
 <DesignInspectorPanel selection={designRows().filter(n=>s.selectedIds.includes(n.id))} onChange={patch=>patchDesignNodes(new Map(s.selectedIds.map(id=>[id,patch])))} onAlign={kind=>patchDesignNodes(alignPatches(designRows().filter(n=>s.selectedIds.includes(n.id)),kind))} onDistribute={axis=>patchDesignNodes(distributePatches(designRows().filter(n=>s.selectedIds.includes(n.id)),axis))}/>
 <p className="text-xs text-ink-2">Project exports include every artboard. SVG exports include the active artboard only. Keep the project export to retain layer settings.</p>
 </div>}
 </aside>;
}
