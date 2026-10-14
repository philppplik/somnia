import {Checkbox} from '../ui/checkbox';
import {InterfacePages} from './InterfacePages';
import {interfaceTreeOrder,interfaceTreeTarget} from '../../lib/interface/accessibility';
import {InterfaceLibrary} from './InterfaceLibrary';
import {StudioStatus} from '../studios/StudioStatus';
import {InterfaceInteractions} from './InterfacePrototype';
import {InterfaceDevMode} from './InterfaceDevMode';
import {setInterfaceConstraint,setInterfaceAbsolute} from '../../lib/interface/constraints';
import {resizeInterfaceFrame} from '../../lib/interface/responsive';
import {computeInterfaceLayout} from '../../lib/interface/layout';
import {interfaceLayerCSS} from '../../lib/interface/export';
import {auditInterfaceDocument} from '../../lib/interface/a11y';
import {addInterfaceBreakpoint,removeInterfaceBreakpoint,applyInterfaceBreakpoint,auditInterfaceResponsive} from '../../lib/interface/breakpoints';
import {INTERFACE_FRAME_PRESETS} from '../../lib/interface/pages';
import {getInterfacePresetPreview,setInterfacePresetPreview,useInterfacePresetPreview} from './presetPreview';
import {InterfaceVariantProperties} from './InterfaceVariantProperties';
import {Field} from './InterfaceField';
export {Field};
import {InterfaceSelectionControls} from './InterfaceSelection';
import {InterfaceMediaControls} from './InterfaceMedia';
import {InterfaceVectorControls} from './InterfaceVectorControls';
import {InterfaceResources,InterfaceBindings} from './InterfaceResources';
import {InterfaceOutput} from './InterfaceOutput';
import {patchInterfaceNode,owningInstance,createComponent,instantiateComponent,addComponentVariant,switchInstanceVariant,resetInstanceOverrides,detachInstance} from '../../lib/interface/components';
import {DEFAULT_LAYOUT,DEFAULT_SIZING,type InterfaceLayout,type InterfaceSizing,type ConstraintMode} from '../../lib/interface/schema';
import {useMemo,useState,type ReactNode} from 'react';
import {Button} from '../ui/button';
import {PanelSection} from '../ui/panel';
import {useId} from 'react';
import {useT} from '../../lib/useT';
import {useInterfaceState,interfaceSession} from '../../lib/interface/session';
import {addNode,deleteNode,reparentNode,uid,type InterfaceNode} from '../../lib/interface/model';

function Guard({children}:{children:(run:(f:()=>void)=>void)=>ReactNode}){
 const [error,setError]=useState('');return <>{children(f=>{try{f();setError('');}catch(e){setError(e instanceof Error?e.message:'Invalid edit.');}})}{error&&<StudioStatus tone="error" live="assertive" className="block text-xs text-ink">{error}</StudioStatus>}</>;
}
export function InterfaceLayers(){
 const [treeFocus,setTreeFocus]=useState<string|null>(null);const s=useInterfaceState();const {t}=useT();const doc=s.document;const page=doc?.pages.find(p=>p.id===s.pageId);
 if(!doc||!page)return <StudioStatus live="off" className="block p-3 text-xs text-ink-2">{t('interface.empty')}</StudioStatus>;
 const order=interfaceTreeOrder(doc,page.id),active=treeFocus&&order.includes(treeFocus)?treeFocus:s.selection&&order.includes(s.selection)?s.selection:order[0];
 const row=(id:string,depth:number):ReactNode=>{const n=doc.nodes.find(n=>n.id===id)!;return <li key={id} role="none">
  <button role="treeitem" data-layer-id={id} tabIndex={id===active?0:-1} aria-level={depth+1} aria-expanded={n.children.length?true:undefined} aria-selected={s.selectedIds.includes(id)} aria-label={`${n.name} · ${t(`interface.${n.kind}`)}${n.locked?` · ${t('interface.locked')}`:''}${n.hidden?` · ${t('interface.hidden')}`:''}`} onFocus={()=>setTreeFocus(id)} onKeyDown={e=>{const target=interfaceTreeTarget(doc,page.id,id,e.key);if(target){e.preventDefault();setTreeFocus(target);Array.from(e.currentTarget.closest('[role=tree]')?.querySelectorAll<HTMLElement>('[data-layer-id]')??[]).find(el=>el.dataset.layerId===target)?.focus();}else if(e.key==='Enter'||e.key===' '){e.preventDefault();interfaceSession.select(id,e.shiftKey||e.ctrlKey||e.metaKey);}}} className="w-full rounded px-2 py-1.5 text-left text-xs focus-visible:outline-accent" style={{paddingLeft:8+depth*14,background:s.selectedIds.includes(id)?'var(--bg-hover)':undefined,opacity:n.hidden?0.55:1}} onClick={e=>interfaceSession.select(id,e.shiftKey||e.ctrlKey||e.metaKey)}>{n.name}{n.locked?' 🔒':''}</button>
  {n.children.length>0&&<ul role="group" className="m-0 list-none p-0">{n.children.map(child=>row(child,depth+1))}</ul>}
 </li>;};
 return <Guard>{run=><div className="flex flex-col gap-3 p-3">
  <label className="text-xs">{t('interface.page')}<select aria-label={t('interface.page')} className="mt-1 w-full rounded border border-subtle bg-panel p-2" value={s.pageId??''} onChange={e=>interfaceSession.page(e.target.value)}>{doc.pages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <InterfacePages run={run}/><Field name={t('interface.pageName')} value={page.name} onCommit={name=>run(()=>interfaceSession.transact(d=>{d.pages.find(p=>p.id===page.id)!.name=name;}))}/>
  <label className="text-xs">{t('interface.navigateFrame')}<select className="mt-1 w-full bg-panel p-2" value={doc.nodes.find(n=>n.id===s.selection&&n.kind==='frame')?.id??''} onChange={e=>{interfaceSession.select(e.target.value||null);window.dispatchEvent(new CustomEvent('interface-reveal',{detail:e.target.value}));}}><option value="">{t('interface.none')}</option>{doc.nodes.filter(n=>n.pageId===page.id&&n.kind==='frame').map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
  <Button size="compact" variant="outline" onClick={()=>run(()=>{const id=uid();interfaceSession.transact(d=>d.pages.push({id,name:`${t('interface.page')} ${d.pages.length+1}`,children:[]}));interfaceSession.page(id);})}>{t('interface.addPage')}</Button>
  <div className="flex flex-wrap gap-1">{(['frame','rectangle','text','group','ellipse','line','path'] as const).map(kind=><Button size="compact" key={kind} onClick={()=>run(()=>{const selected=doc.nodes.find(n=>n.id===s.selection);let id='';interfaceSession.transact(d=>{id=addNode(d,page.id,kind,selected&&['frame','group'].includes(selected.kind)&&!selected.locked?selected.id:null);});interfaceSession.select(id);})}>{t(`interface.${kind}`)}</Button>)}</div>
  {(doc.components??[]).length>0&&<details open className="border-t border-subtle pt-2"><summary className="mb-2 text-xs">{t('interface.component')}</summary><div className="flex flex-col gap-1">{doc.components!.flatMap(c=>c.variants.map(v=><Button key={v.id} size="compact" variant="outline" onClick={()=>run(()=>{let id='';interfaceSession.transact(d=>{id=instantiateComponent(d,c.id,v.id,page.id);});interfaceSession.select(id);})}>{c.name} / {v.name}</Button>))}</div></details>}
  <InterfaceLibrary run={run}/>
  <InterfaceResources run={run}/>
  <ul role="tree" aria-multiselectable="true" aria-label={t('interface.layers')} className="m-0 list-none p-0">{page.children.map(id=>row(id,0))}</ul>
 </div>}</Guard>;
}
export function InterfaceProperties(){
 const s=useInterfaceState();const {t}=useT();const doc=s.document;const node=doc?.nodes.find(n=>n.id===s.selection);
 if(!doc)return <StudioStatus live="off" className="block p-3 text-xs text-ink-2">{t('interface.empty')}</StudioStatus>;
 const patch=(change:Partial<InterfaceNode>)=>interfaceSession.transact(d=>{const n=d.nodes.find(n=>n.id===node?.id);if(n)patchInterfaceNode(d,n.id,change);});
 const move=(delta:number)=>{if(!node)return;const siblings=node.parentId?doc.nodes.find(n=>n.id===node.parentId)!.children:doc.pages.find(p=>p.id===node.pageId)!.children;const index=siblings.indexOf(node.id);interfaceSession.transact(d=>reparentNode(d,node.id,node.parentId,Math.max(0,Math.min(siblings.length-1,index+delta))));};
 return <Guard>{run=><div key={`${doc.id}:${node?.id??'document'}`} className="flex flex-col gap-3 p-3">
  <Field name={t('interface.name')} value={doc.name} onCommit={name=>run(()=>interfaceSession.transact(d=>{d.name=name;}))}/>
  <InterfaceSelectionControls run={run}/>
  {s.selectedIds.length>1?<p className="text-xs text-ink-2">{t('interface.multiSelection',{count:s.selectedIds.length})}</p>:!node?<p className="text-xs text-ink-2">{t('interface.noSelection')}</p>:<>
   <Field name={t('interface.name')} value={node.name} disabled={node.locked} onCommit={name=>run(()=>patch({name}))}/>
   <div className="grid grid-cols-2 gap-2">{(['x','y','width','height'] as const).map(key=><Field key={key} name={t(`interface.${key}`)} value={node[key]} type="number" disabled={node.locked} onCommit={value=>run(()=>{if(!value.trim())throw Error('A number is required.');patch({[key]:Number(value)});})}/>)}</div>
   <Field name={t('interface.fill')} value={node.fill} type="color" disabled={node.locked} onCommit={fill=>run(()=>patch({fill}))}/>
   {node.kind==='text'&&<Field name={t('interface.text')} value={node.text??''} disabled={node.locked} onCommit={text=>run(()=>patch({text}))}/>}
   {node.imageFill&&<Field name={t('interface.altText')} value={node.altText??''} disabled={node.locked} onCommit={altText=>run(()=>patch({altText}))}/>}
   <label className="text-xs">{t('interface.parent')}<select className="mt-1 w-full rounded border border-subtle bg-panel p-2" value={node.parentId??''} disabled={node.locked} onChange={e=>run(()=>{const parent=e.target.value||null;const count=parent?doc.nodes.find(n=>n.id===parent)!.children.length:doc.pages.find(p=>p.id===node.pageId)!.children.length;interfaceSession.transact(d=>reparentNode(d,node.id,parent,count-(parent===node.parentId?1:0)));})}><option value="">{t('interface.root')}</option>{doc.nodes.filter(n=>n.pageId===node.pageId&&n.id!==node.id&&['frame','group'].includes(n.kind)&&!n.locked).map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
   {(['hidden','locked'] as const).map(key=><label key={key} className="flex items-center gap-2 text-xs"><input style={{width:14,flexShrink:0}} type="checkbox" checked={node[key]} disabled={key==='hidden'&&node.locked} onChange={e=>run(()=>patch({[key]:e.target.checked}))}/>{t(`interface.${key}`)}</label>)}
   {node.kind==='frame'&&<Choice label={t('interface.variableMode')} value={node.variableMode??''} options={[["",t('interface.inheritMode')],["light",t('interface.mode.light')],["dark",t('interface.mode.dark')]]} disabled={node.locked} onChange={mode=>run(()=>patch({variableMode:mode?mode as 'light'|'dark':undefined}))}/>}
   <InterfaceLayoutControls node={node} run={run} patch={patch}/>
   <InterfaceResponsiveControls node={node} run={run}/>
   <InterfaceComponentControls node={node} run={run}/>
   <InterfaceVariantProperties node={node} run={run}/>
   <InterfaceBindings nodeId={node.id} run={run}/>
   <InterfaceMediaControls/>
   <InterfaceVectorControls nodeId={node.id} run={run}/>

   <div className="flex flex-wrap gap-1"><Button size="compact" variant="outline" disabled={node.locked} onClick={()=>run(()=>move(-1))}>{t('interface.up')}</Button><Button size="compact" variant="outline" disabled={node.locked} onClick={()=>run(()=>move(1))}>{t('interface.down')}</Button><Button size="compact" variant="outline" disabled={node.locked} onClick={()=>run(()=>interfaceSession.transact(d=>deleteNode(d,node.id)))}>{t('interface.delete')}</Button><InterfaceCopyCss node={node} run={run}/></div>
  </>}
  {node&&s.selectedIds.length===1&&<InterfaceInteractions node={node} run={run}/>}
  <InterfaceA11yReview/>
  <InterfaceDevMode/>
  <InterfaceOutput/>
 </div>}</Guard>;
}

function Choice({label,value,options,disabled,onChange}:{label:string;value:string;options:[string,string][];disabled?:boolean;onChange:(value:string)=>void}){return <label className="flex min-w-0 flex-col gap-1 text-xs">{label}<select aria-label={label} className="w-full rounded border border-subtle bg-panel p-2" value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;}
function InspectorGroup({title,children}:{title:string;children:ReactNode}){const [open,setOpen]=useState(true);const id=useId();return <PanelSection title={title} id={`interface-inspector-${id}`} open={open} onOpenChange={setOpen} className="border-t border-subtle pt-3">{children}</PanelSection>;}
function InterfaceLayoutControls({node,run,patch}:{node:InterfaceNode;run:(f:()=>void)=>void;patch:(change:Partial<InterfaceNode>)=>void}){
 const s=useInterfaceState(),{t}=useT();const instance=owningInstance(s.document!,node.id);const disabled=node.locked||!!instance;const layout=node.layout??DEFAULT_LAYOUT,sizing=node.sizing??DEFAULT_SIZING;
 const option=(ids:string[]):[string,string][]=>ids.map(id=>[id,t(`interface.${id==='fill'?'fillSpace':id}`)]);
 const setLayout=(change:Partial<InterfaceLayout>)=>run(()=>patch({layout:{...layout,...change}}));const setSizing=(change:Partial<InterfaceSizing>)=>run(()=>patch({sizing:{...sizing,...change}}));
 const number=(value:string)=>{if(!value.trim())throw Error('A number is required.');return Number(value);};
 const parent=s.document!.nodes.find(n=>n.id===node.parentId);const isContainer=['frame','group'].includes(node.kind);
 const computed=useMemo(()=>s.document?computeInterfaceLayout(s.document).bounds.get(node.id):undefined,[s.document,node.id]);
 return <InspectorGroup title={t('interface.layout')}><div className="flex flex-col gap-3">
  {computed&&<p className="text-xs text-ink-2">{t('interface.computedSize')} {Math.round(computed.width)} × {Math.round(computed.height)}</p>}
  {isContainer&&<><Choice label={t('interface.direction')} value={layout.direction} options={option(['free','row','column','grid'])} disabled={disabled} onChange={v=>setLayout({direction:v as InterfaceLayout['direction']})}/>
   {layout.direction==='grid'&&<Field name={t('interface.columns')} value={layout.columns??2} type="number" disabled={disabled} onCommit={v=>run(()=>patch({layout:{...layout,columns:number(v)}}))}/>}
   {layout.direction==='grid'&&<Choice label={t('interface.rows')} value={layout.rows?String(layout.rows):''} options={[['',t('interface.auto')] as [string,string],...Array.from({length:12},(_,i)=>[String(i+1),String(i+1)] as [string,string])]} disabled={disabled} onChange={v=>setLayout({rows:v?Number(v):undefined})}/>}
   {layout.direction!=='free'&&<><label className="flex items-center gap-2 text-xs"><input style={{width:14}} type="checkbox" checked={layout.wrap} disabled={disabled} onChange={e=>setLayout({wrap:e.target.checked})}/>{t('interface.wrap')}</label><Field name={t('interface.gap')} value={layout.gap} type="number" disabled={disabled} onCommit={v=>run(()=>patch({layout:{...layout,gap:number(v)}}))}/><Choice label={t('interface.align')} value={layout.align} options={option(['start','center','end','stretch'])} disabled={disabled} onChange={v=>setLayout({align:v as InterfaceLayout['align']})}/>{layout.direction!=='grid'&&<Choice label={t('interface.justify')} value={layout.justify??'start'} options={[['start',t('interface.start')],['center',t('interface.center')],['end',t('interface.end')],['space-between',t('interface.spaceBetween')]]} disabled={disabled} onChange={v=>setLayout({justify:v as InterfaceLayout['justify']})}/>}{(layout.wrap||layout.direction==='grid')&&<Field name={t('interface.crossGap')} value={layout.crossGap??layout.gap} type="number" disabled={disabled} onCommit={v=>run(()=>patch({layout:{...layout,crossGap:number(v)}}))}/>}<div className="grid grid-cols-2 gap-2">{['top','right','bottom','left'].map((edge,index)=><Field key={edge} name={t(`interface.padding.${edge}`)} value={layout.padding[index]} type="number" disabled={disabled} onCommit={v=>run(()=>{const padding=[...layout.padding] as InterfaceLayout['padding'];padding[index]=number(v);patch({layout:{...layout,padding}});})}/>)}</div></>}
  </>}
  <div className="grid grid-cols-2 gap-2">{(['width','height'] as const).map(axis=><Choice key={axis} label={`${t(`interface.${axis}`)} / ${t('interface.sizing')}`} value={sizing[axis]} options={option(['fixed','hug','fill'])} disabled={disabled} onChange={v=>setSizing({[axis]:v})}/>)}</div>
  <div className="grid grid-cols-2 gap-2">{(['minWidth','maxWidth','minHeight','maxHeight'] as const).map(key=><Field key={key} name={t(`interface.${key}`)} value={sizing[key]} type="number" disabled={disabled} onCommit={v=>run(()=>patch({sizing:{...sizing,[key]:number(v)}}))}/>)}</div>
  {parent&&(parent.layout??DEFAULT_LAYOUT).direction==='grid'&&<Field name={t('interface.span')} value={node.span??1} type="number" disabled={disabled} onCommit={v=>run(()=>patch({span:Math.round(number(v))}))}/>}
  <Checkbox label={t('interface.aspectLock')} checked={node.aspectRatio!==undefined} disabled={disabled} onChange={e=>run(()=>interfaceSession.transact(d=>{const target=d.nodes.find(n=>n.id===node.id)!;if(e.target.checked)target.aspectRatio=Math.round(target.width/Math.max(1,target.height)*1000)/1000;else delete target.aspectRatio;}))}/>
  {node.aspectRatio!==undefined&&<p className="text-xs text-ink-2">{t('interface.aspectRatio')} {node.aspectRatio.toFixed(2)}</p>}
  {parent&&<><label className="flex items-center gap-2 text-xs"><input style={{width:14}} type="checkbox" checked={sizing.absolute} disabled={disabled} onChange={e=>run(()=>interfaceSession.transact(d=>setInterfaceAbsolute(d,node.id,e.target.checked)))}/>{t('interface.absolute')}</label>{(!parent.layout||parent.layout.direction==='free'||sizing.absolute)&&<div className="grid grid-cols-2 gap-2">{(['horizontal','vertical'] as const).map(axis=><Choice key={axis} label={t(`interface.${axis}`)} value={node.constraints?.[axis]??'start'} options={option(['start','end','center','stretch','scale'])} disabled={disabled} onChange={v=>run(()=>interfaceSession.transact(d=>setInterfaceConstraint(d,node.id,axis,v as ConstraintMode)))}/>)}</div>}</>}
 </div></InspectorGroup>;
}
function InterfaceA11yReview(){
 const s=useInterfaceState(),{t}=useT();const audit=useMemo(()=>s.document?auditInterfaceDocument(s.document):null,[s.document]);
 if(!audit)return null;const doc=s.document!;
 const reveal=(id:string)=>{const target=doc.nodes.find(n=>n.id===id);if(!target)return;interfaceSession.page(target.pageId);interfaceSession.select(id);window.dispatchEvent(new CustomEvent('interface-reveal',{detail:id}));};
 return <InspectorGroup title={t('interface.a11y')}>{audit.findings.length?<ul className="flex flex-col gap-2 text-xs">{audit.findings.map(f=><li key={f.id} className="flex flex-col gap-1"><Button size="compact" variant="outline" className="w-full whitespace-normal h-auto min-h-7 py-1 text-left justify-start" onClick={()=>reveal(f.layerId)}>{t(`interface.a11y.${f.kind}`,f.params)}</Button>{f.suggestions?.length?<><p className="text-ink-2">{t('interface.a11y.suggest')}: {f.suggestions.map(sg=>`${sg.name} (${sg.value}, ${sg.ratio}:1)`).join(' · ')}</p><div className="flex flex-wrap gap-1">{f.suggestions.map(sg=><Button key={sg.name} size="compact" disabled={doc.nodes.find(n=>n.id===f.layerId)?.locked} onClick={()=>interfaceSession.transact(d=>patchInterfaceNode(d,f.layerId,{fill:sg.value}))}>{t('interface.a11y.apply',{name:`${sg.name} (${sg.ratio}:1)`})}</Button>)}</div></>:null}</li>)}</ul>:<p className="text-xs text-ink-2">{t('interface.a11y.ok')}</p>}</InspectorGroup>;
}
function InterfaceCopyCss({node,run}:{node:InterfaceNode;run:(f:()=>void)=>void}){
 const {t}=useT();const s=useInterfaceState();const [copied,setCopied]=useState(false);
 return <Button size="compact" variant="outline" disabled={node.locked||copied} onClick={()=>{let css='';run(()=>{css=interfaceLayerCSS(s.document!,node.id).css;});if(!css)return;if(!navigator.clipboard?.writeText){run(()=>{throw Error('Clipboard is unavailable in this context.');});return;}void navigator.clipboard.writeText(css).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);},()=>run(()=>{throw Error('Copying CSS failed.');}));}}>{t(copied?'interface.cssCopied':'interface.copyCss')}</Button>;
}
function InterfaceResponsiveControls({node,run}:{node:InterfaceNode;run:(f:()=>void)=>void}){
 const s=useInterfaceState();const {t}=useT();const active=useInterfacePresetPreview();const [preset,setPreset]=useState<keyof typeof INTERFACE_FRAME_PRESETS>('phone');
 const [bpName,setBpName]=useState('');const [bpPreset,setBpPreset]=useState<keyof typeof INTERFACE_FRAME_PRESETS>('phone');
 const audit=useMemo(()=>s.document&&node.kind==='frame'&&node.breakpoints?.length?auditInterfaceResponsive(s.document,node.id):null,[s.document,node]);
 if(node.kind!=='frame')return null;const isActive=active?.frameId===node.id,size=INTERFACE_FRAME_PRESETS[preset];
 const presetOptions=(Object.keys(INTERFACE_FRAME_PRESETS) as (keyof typeof INTERFACE_FRAME_PRESETS)[]).map(key=>[key,`${t(`interface.preset.${key}`)} · ${INTERFACE_FRAME_PRESETS[key].width} × ${INTERFACE_FRAME_PRESETS[key].height}`]) as [string,string][];
 return <InspectorGroup title={t('interface.responsive')}><div className="flex flex-col gap-3">
  <Choice label={t('interface.responsivePreset')} value={preset} options={presetOptions} disabled={node.locked} onChange={v=>setPreset(v as keyof typeof INTERFACE_FRAME_PRESETS)}/>
  {isActive&&<p className="text-xs text-ink-2" role="status">{t('interface.previewingSize',{width:active.width,height:active.height})}</p>}
  <div className="flex flex-wrap gap-1"><Button size="compact" variant="outline" disabled={node.locked} onClick={()=>setInterfacePresetPreview({frameId:node.id,width:size.width,height:size.height})}>{t('interface.presetPreview')}</Button><Button size="compact" disabled={!isActive||node.locked} onClick={()=>run(()=>{const pending=getInterfacePresetPreview();if(pending?.frameId!==node.id)return;interfaceSession.transact(d=>resizeInterfaceFrame(d,node.id,{width:pending.width,height:pending.height}));setInterfacePresetPreview(null);})}>{t('interface.applySize')}</Button><Button size="compact" variant="outline" disabled={!isActive} onClick={()=>setInterfacePresetPreview(null)}>{t('interface.revertPreview')}</Button></div>
  <div className="flex flex-col gap-2 border-t border-subtle pt-3">
   <p className="text-xs font-medium">{t('interface.breakpoints')}</p>
   {(node.breakpoints??[]).map(bp=><div key={bp.id} className="flex flex-wrap items-center gap-1 text-xs">
    <span className="min-w-0 flex-1 truncate">{bp.name} · {bp.width} × {bp.height}</span>
    <Button size="compact" variant="outline" disabled={node.locked} onClick={()=>setInterfacePresetPreview({frameId:node.id,width:bp.width,height:bp.height})}>{t('interface.breakpoint.preview')}</Button>
    <Button size="compact" variant="outline" disabled={node.locked} onClick={()=>run(()=>{interfaceSession.transact(d=>applyInterfaceBreakpoint(d,node.id,bp.id));setInterfacePresetPreview(null);})}>{t('interface.breakpoint.apply')}</Button>
    <Button size="compact" variant="outline" disabled={node.locked} onClick={()=>run(()=>interfaceSession.transact(d=>removeInterfaceBreakpoint(d,node.id,bp.id)))}>{t('interface.breakpoint.remove')}</Button>
   </div>)}
   <Field name={t('interface.breakpoint.name')} value={bpName} disabled={node.locked} onCommit={setBpName}/>
   <Choice label={t('interface.responsivePreset')} value={bpPreset} options={presetOptions} disabled={node.locked} onChange={v=>setBpPreset(v as keyof typeof INTERFACE_FRAME_PRESETS)}/>
   <div><Button size="compact" disabled={node.locked||!bpName.trim()} onClick={()=>run(()=>{interfaceSession.transact(d=>addInterfaceBreakpoint(d,node.id,{name:bpName,...INTERFACE_FRAME_PRESETS[bpPreset]}));setBpName('');})}>{t('interface.breakpoint.add')}</Button></div>
  </div>
  {audit&&<div className="flex flex-col gap-2 border-t border-subtle pt-3">
   <p className="text-xs font-medium">{t('interface.responsiveIssues')}</p>
   {audit.issues.length?<ul className="flex flex-col gap-2 text-xs">{audit.issues.map(issue=><li key={issue.id}>{t(`interface.issue.${issue.kind}`,issue.params)}</li>)}</ul>:<p className="text-xs text-ink-2">{t('interface.responsiveIssues.ok')}</p>}
  </div>}
 </div></InspectorGroup>;
}
function InterfaceComponentControls({node,run}:{node:InterfaceNode;run:(f:()=>void)=>void}){
 const s=useInterfaceState(),{t}=useT();const doc=s.document!,owner=owningInstance(doc,node.id),component=doc.components?.find(c=>c.variants.some(v=>v.rootId===node.id));
 const edit=(f:(d:typeof doc)=>void)=>run(()=>interfaceSession.transact(f));
 return <InspectorGroup title={t('interface.component')}><div className="flex flex-col gap-2">
  {node.kind==='frame'&&!owner&&!component&&<Button size="compact" variant="outline" disabled={node.locked} onClick={()=>edit(d=>{createComponent(d,node.id,node.name);})}>{t('interface.createComponent')}</Button>}
  {component&&<><span className="text-xs text-ink-2">{component.name}</span><Button size="compact" variant="outline" disabled={node.locked} onClick={()=>run(()=>{let id='';interfaceSession.transact(d=>{id=instantiateComponent(d,component.id,component.variants.find(v=>v.rootId===node.id)!.id,s.pageId!);});interfaceSession.select(id);})}>{t('interface.createInstance')}</Button><Button size="compact" variant="outline" disabled={node.locked} onClick={()=>edit(d=>{addComponentVariant(d,component.id,component.variants.find(v=>v.rootId===node.id)!.id,`${t('interface.variant')} ${component.variants.length+1}`);})}>{t('interface.addVariant')}</Button></>}
  {owner&&<><p className="text-xs text-ink-2">{t('interface.instanceNote')}</p>{owner.id!==node.id?<Button size="compact" variant="outline" onClick={()=>interfaceSession.select(owner.id)}>{t('interface.selectInstance')}</Button>:<><Choice label={t('interface.variant')} value={owner.instance!.variantId} options={doc.components!.find(c=>c.id===owner.instance!.componentId)!.variants.map(v=>[v.id,v.name])} disabled={owner.locked} onChange={id=>edit(d=>switchInstanceVariant(d,owner.id,id))}/><div className="flex flex-wrap gap-1"><Button size="compact" variant="outline" disabled={owner.locked} onClick={()=>edit(d=>resetInstanceOverrides(d,owner.id))}>{t('interface.resetOverrides')}</Button><Button size="compact" variant="outline" disabled={owner.locked} onClick={()=>edit(d=>detachInstance(d,owner.id))}>{t('interface.detach')}</Button><Button size="compact" variant="outline" onClick={()=>{const id=doc.components!.find(c=>c.id===owner.instance!.componentId)!.variants.find(v=>v.id===owner.instance!.variantId)!.rootId;interfaceSession.page(doc.nodes.find(n=>n.id===id)!.pageId);interfaceSession.select(id);}}>{t('interface.goMaster')}</Button></div></>}</>}
 </div></InspectorGroup>;
}
