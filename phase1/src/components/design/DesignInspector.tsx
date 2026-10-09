import {useState} from 'react';
import {createArtboard,uid,type DesignNode,type Artboard} from '../../lib/design/model';
import {editDesign,selectArtboard,selectDesignNode,useDesignState} from '../../lib/design/session';
import {Button} from '../ui/button';
const fieldClass='w-full rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-sm';
function NumberField({label,value,min,max,onChange}:{label:string;value:number;min:number;max:number;onChange:(n:number)=>void}){
 const [draft,setDraft]=useState<string|null>(null);
 const commit=()=>{if(draft!==null){const n=Number(draft);if(draft.trim()&&Number.isFinite(n))onChange(Math.min(max,Math.max(min,n)));setDraft(null);}};
 return <label className="space-y-1 text-xs text-ink-2">{label}<input className={fieldClass} type="number" aria-label={label} min={min} max={max} value={draft??value} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){commit();e.currentTarget.blur();}if(e.key==='Escape'){setDraft(null);e.currentTarget.blur();}}}/></label>;
}
export function DesignInspector(){
 const s=useDesignState();const board=s.document?.artboards.find(a=>a.id===s.artboardId);const node=board?.nodes.find(n=>n.id===s.selection);
 const updateBoard=(patch:Partial<Artboard>)=>{if(board)editDesign(doc=>({...doc,artboards:doc.artboards.map(a=>a.id===board.id?{...a,...patch}:a)}));};
 const updateNode=(patch:Partial<DesignNode>)=>{if(board&&node&&!node.locked)editDesign(doc=>({...doc,artboards:doc.artboards.map(a=>a.id===board.id?{...a,nodes:a.nodes.map(n=>n.id===node.id?{...n,...patch}:n)}:a)}));};
 const flag=(id:string,patch:Partial<DesignNode>)=>{if(board)editDesign(doc=>({...doc,artboards:doc.artboards.map(a=>a.id===board.id?{...a,nodes:a.nodes.map(n=>n.id===id?{...n,...patch}:n)}:a)}));};
 const remove=()=>{if(node&&board&&!node.locked){updateBoard({nodes:board.nodes.filter(n=>n.id!==node.id)});selectDesignNode(null);}};
 const duplicate=()=>{if(node&&board){const copy={...node,id:uid(),name:`${node.name} copy`,x:Math.min(32768,node.x+16),y:Math.min(32768,node.y+16),locked:false};updateBoard({nodes:[...board.nodes,copy]});selectDesignNode(copy.id);}};
 const reorder=(direction:number)=>{if(!board||!node||node.locked)return;const nodes=[...board.nodes];const index=nodes.findIndex(n=>n.id===node.id);const next=index+direction;if(next<0||next>=nodes.length)return;[nodes[index],nodes[next]]=[nodes[next],nodes[index]];updateBoard({nodes});};
 return <aside className="panel h-full overflow-auto p-4" data-testid="design-inspector" aria-label="Design properties">
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
 <section className="space-y-2"><h3 className="text-xs font-semibold uppercase text-ink-2">Layers</h3>{!board.nodes.length&&<p className="text-xs text-ink-2">Add a rectangle or text layer from the toolbar.</p>}
 {[...board.nodes].reverse().map(n=><div key={n.id} className={`flex items-center gap-1 rounded-lg p-1 ${s.selection===n.id?'bg-hover':''}`}><button className="min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-sm" aria-label={`Select ${n.name}`} aria-pressed={s.selection===n.id} onClick={()=>selectDesignNode(n.id)}>{n.kind==='text'?'T':'▧'} {n.name}</button><button className="rounded p-1 text-xs" aria-label={`${n.hidden?'Show':'Hide'} ${n.name}`} onClick={()=>flag(n.id,{hidden:!n.hidden})}>{n.hidden?'Show':'Hide'}</button><button className="rounded p-1 text-xs" aria-label={`${n.locked?'Unlock':'Lock'} ${n.name}`} onClick={()=>flag(n.id,{locked:!n.locked})}>{n.locked?'Unlock':'Lock'}</button></div>)}
 </section>
 {node&&<section className="space-y-3"><h3 className="text-xs font-semibold uppercase text-ink-2">Selected layer</h3>{node.locked&&<p className="text-xs text-ink-2">Unlock this layer to edit it.</p>}
 <fieldset disabled={node.locked} className="space-y-3 disabled:opacity-60"><label className="block space-y-1 text-xs text-ink-2">Layer name<input className={fieldClass} aria-label="Layer name" maxLength={200} value={node.name} onChange={e=>updateNode({name:e.target.value})}/></label>
 <div className="grid grid-cols-2 gap-2"><NumberField label="X" value={node.x} min={-32768} max={32768} onChange={x=>updateNode({x})}/><NumberField label="Y" value={node.y} min={-32768} max={32768} onChange={y=>updateNode({y})}/><NumberField label="Width" value={node.width} min={1} max={16384} onChange={width=>updateNode({width})}/><NumberField label="Height" value={node.height} min={1} max={16384} onChange={height=>updateNode({height})}/></div>
 <label className="flex items-center justify-between text-xs text-ink-2">Fill<input type="color" aria-label="Fill" value={node.fill} onChange={e=>updateNode({fill:e.target.value})}/></label>
 {node.kind==='rectangle'?<NumberField label="Corner radius" value={node.radius} min={0} max={8192} onChange={radius=>updateNode({radius})}/>:<><label className="block space-y-1 text-xs text-ink-2">Text<textarea className={fieldClass} rows={3} aria-label="Text" maxLength={10000} value={node.text} onChange={e=>updateNode({text:e.target.value})}/></label><NumberField label="Font size" value={node.fontSize} min={1} max={512} onChange={fontSize=>updateNode({fontSize})}/></>}
 <div className="flex flex-wrap gap-2"><Button size="compact" variant="outline" onClick={()=>reorder(1)}>Bring forward</Button><Button size="compact" variant="outline" onClick={()=>reorder(-1)}>Send backward</Button><Button size="compact" variant="outline" onClick={remove}>Delete layer</Button></div></fieldset>
 <Button size="compact" variant="outline" onClick={duplicate}>Duplicate layer</Button>
 </section>}
 <p className="text-xs text-ink-2">Project exports include every artboard. SVG exports include the active artboard only. Keep the project export to retain layer settings.</p>
 </div>}
 </aside>;
}
