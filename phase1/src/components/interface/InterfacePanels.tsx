import {patchInterfaceNode,owningInstance,createComponent,instantiateComponent,addComponentVariant,switchInstanceVariant,resetInstanceOverrides,detachInstance} from '../../lib/interface/components';
import {DEFAULT_LAYOUT,DEFAULT_SIZING,type InterfaceLayout,type InterfaceSizing,type ConstraintMode} from '../../lib/interface/schema';
import {computeInterfaceLayout} from '../../lib/interface/layout';
import {useState,type ReactNode} from 'react';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {useInterfaceState,interfaceSession} from '../../lib/interface/session';
import {addNode,deleteNode,reparentNode,uid,type InterfaceNode} from '../../lib/interface/model';

function Guard({children}:{children:(run:(f:()=>void)=>void)=>ReactNode}){
 const [error,setError]=useState('');return <>{children(f=>{try{f();setError('');}catch(e){setError(e instanceof Error?e.message:'Invalid edit.');}})}{error&&<p role="alert" className="text-xs text-ink">{error}</p>}</>;
}
export function InterfaceLayers(){
 const s=useInterfaceState();const {t}=useT();const doc=s.document;const page=doc?.pages.find(p=>p.id===s.pageId);
 if(!doc||!page)return <p className="p-3 text-xs text-ink-2">{t('interface.empty')}</p>;
 const row=(id:string,depth:number):ReactNode=>{const n=doc.nodes.find(n=>n.id===id)!;return <li key={id}>
  <button className="w-full rounded px-2 py-1.5 text-left text-xs focus-visible:outline-accent" style={{paddingLeft:8+depth*14,background:s.selection===id?'var(--bg-hover)':undefined,opacity:n.hidden?0.55:1}} aria-pressed={s.selection===id} onClick={()=>interfaceSession.select(id)}>{n.name}{n.locked?' 🔒':''}</button>
  {n.children.length>0&&<ul className="m-0 list-none p-0">{n.children.map(child=>row(child,depth+1))}</ul>}
 </li>;};
 return <Guard>{run=><div className="flex flex-col gap-3 p-3">
  <label className="text-xs">{t('interface.page')}<select className="mt-1 w-full rounded border border-subtle bg-panel p-2" value={s.pageId??''} onChange={e=>interfaceSession.page(e.target.value)}>{doc.pages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <Button size="compact" variant="outline" onClick={()=>run(()=>{const id=uid();interfaceSession.transact(d=>d.pages.push({id,name:`${t('interface.page')} ${d.pages.length+1}`,children:[]}));interfaceSession.page(id);})}>{t('interface.addPage')}</Button>
  <div className="flex flex-wrap gap-1">{(['frame','rectangle','text','group'] as const).map(kind=><Button size="compact" key={kind} onClick={()=>run(()=>{const selected=doc.nodes.find(n=>n.id===s.selection);let id='';interfaceSession.transact(d=>{id=addNode(d,page.id,kind,selected&&['frame','group'].includes(selected.kind)&&!selected.locked?selected.id:null);});interfaceSession.select(id);})}>{t(`interface.${kind}`)}</Button>)}</div>
  {(doc.components??[]).length>0&&<details open className="border-t border-subtle pt-2"><summary className="mb-2 text-xs">{t('interface.component')}</summary><div className="flex flex-col gap-1">{doc.components!.flatMap(c=>c.variants.map(v=><Button key={v.id} size="compact" variant="outline" onClick={()=>run(()=>{let id='';interfaceSession.transact(d=>{id=instantiateComponent(d,c.id,v.id,page.id);});interfaceSession.select(id);})}>{c.name} / {v.name}</Button>))}</div></details>}
  <ul aria-label={t('interface.layers')} className="m-0 list-none p-0">{page.children.map(id=>row(id,0))}</ul>
 </div>}</Guard>;
}
export function Field({name,value,type='text',disabled,onCommit}:{name:string;value:string|number;type?:string;disabled?:boolean;onCommit:(value:string)=>void}){
 return <label className="flex min-w-0 flex-col gap-1 text-xs">{name}<input key={`${name}:${value}`} className="min-w-0 rounded border border-subtle bg-panel p-2 text-ink focus-visible:outline-accent" type={type} defaultValue={value} disabled={disabled} onBlur={e=>{if(e.currentTarget.value!==String(value)){onCommit(e.currentTarget.value);e.currentTarget.value=String(value);}}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.currentTarget.value=String(value);e.currentTarget.blur();}}}/></label>;
}
export function InterfaceProperties(){
 const s=useInterfaceState();const {t}=useT();const doc=s.document;const node=doc?.nodes.find(n=>n.id===s.selection);
 if(!doc)return <p className="p-3 text-xs text-ink-2">{t('interface.empty')}</p>;
 const patch=(change:Partial<InterfaceNode>)=>interfaceSession.transact(d=>{const n=d.nodes.find(n=>n.id===node?.id);if(n)patchInterfaceNode(d,n.id,change);});
 const move=(delta:number)=>{if(!node)return;const siblings=node.parentId?doc.nodes.find(n=>n.id===node.parentId)!.children:doc.pages.find(p=>p.id===node.pageId)!.children;const index=siblings.indexOf(node.id);interfaceSession.transact(d=>reparentNode(d,node.id,node.parentId,Math.max(0,Math.min(siblings.length-1,index+delta))));};
 return <Guard>{run=><div className="flex flex-col gap-3 p-3">
  <Field name={t('interface.name')} value={doc.name} onCommit={name=>run(()=>interfaceSession.transact(d=>{d.name=name;}))}/>
  {!node?<p className="text-xs text-ink-2">{t('interface.noSelection')}</p>:<>
   <Field name={t('interface.name')} value={node.name} disabled={node.locked} onCommit={name=>run(()=>patch({name}))}/>
   <div className="grid grid-cols-2 gap-2">{(['x','y','width','height'] as const).map(key=><Field key={key} name={t(`interface.${key}`)} value={node[key]} type="number" disabled={node.locked} onCommit={value=>run(()=>{if(!value.trim())throw Error('A number is required.');patch({[key]:Number(value)});})}/>)}</div>
   <Field name={t('interface.fill')} value={node.fill} type="color" disabled={node.locked} onCommit={fill=>run(()=>patch({fill}))}/>
   {node.kind==='text'&&<Field name={t('interface.text')} value={node.text??''} disabled={node.locked} onCommit={text=>run(()=>patch({text}))}/>}
   <label className="text-xs">{t('interface.parent')}<select className="mt-1 w-full rounded border border-subtle bg-panel p-2" value={node.parentId??''} disabled={node.locked} onChange={e=>run(()=>{const parent=e.target.value||null;const count=parent?doc.nodes.find(n=>n.id===parent)!.children.length:doc.pages.find(p=>p.id===node.pageId)!.children.length;interfaceSession.transact(d=>reparentNode(d,node.id,parent,count-(parent===node.parentId?1:0)));})}><option value="">{t('interface.root')}</option>{doc.nodes.filter(n=>n.pageId===node.pageId&&n.id!==node.id&&['frame','group'].includes(n.kind)&&!n.locked).map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
   {(['hidden','locked'] as const).map(key=><label key={key} className="flex items-center gap-2 text-xs"><input style={{width:14,flexShrink:0}} type="checkbox" checked={node[key]} disabled={key==='hidden'&&node.locked} onChange={e=>run(()=>patch({[key]:e.target.checked}))}/>{t(`interface.${key}`)}</label>)}
   <InterfaceLayoutControls node={node} run={run} patch={patch}/>
   <InterfaceComponentControls node={node} run={run}/>
   <div className="flex flex-wrap gap-1"><Button size="compact" variant="outline" disabled={node.locked} onClick={()=>run(()=>move(-1))}>{t('interface.up')}</Button><Button size="compact" variant="outline" disabled={node.locked} onClick={()=>run(()=>move(1))}>{t('interface.down')}</Button><Button size="compact" variant="outline" disabled={node.locked} onClick={()=>run(()=>interfaceSession.transact(d=>deleteNode(d,node.id)))}>{t('interface.delete')}</Button></div>
  </>}
 </div>}</Guard>;
}

function Choice({label,value,options,disabled,onChange}:{label:string;value:string;options:[string,string][];disabled?:boolean;onChange:(value:string)=>void}){return <label className="flex min-w-0 flex-col gap-1 text-xs">{label}<select className="w-full rounded border border-subtle bg-panel p-2" value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;}
function InterfaceLayoutControls({node,run,patch}:{node:InterfaceNode;run:(f:()=>void)=>void;patch:(change:Partial<InterfaceNode>)=>void}){
 const s=useInterfaceState(),{t}=useT();const instance=owningInstance(s.document!,node.id);const disabled=node.locked||!!instance;const layout=node.layout??DEFAULT_LAYOUT,sizing=node.sizing??DEFAULT_SIZING;
 const option=(ids:string[]):[string,string][]=>ids.map(id=>[id,t(`interface.${id==='fill'?'fillSpace':id}`)]);
 const setLayout=(change:Partial<InterfaceLayout>)=>run(()=>patch({layout:{...layout,...change}}));const setSizing=(change:Partial<InterfaceSizing>)=>run(()=>patch({sizing:{...sizing,...change}}));
 const number=(value:string)=>{if(!value.trim())throw Error('A number is required.');return Number(value);};
 const parent=s.document!.nodes.find(n=>n.id===node.parentId);const isContainer=['frame','group'].includes(node.kind);
 return <details open className="border-t border-subtle pt-3"><summary className="mb-3 cursor-pointer text-xs font-medium">{t('interface.layout')}</summary><div className="flex flex-col gap-3">
  {isContainer&&<><Choice label={t('interface.direction')} value={layout.direction} options={option(['free','row','column'])} disabled={disabled} onChange={v=>setLayout({direction:v as InterfaceLayout['direction']})}/>
   {layout.direction!=='free'&&<><label className="flex items-center gap-2 text-xs"><input style={{width:14}} type="checkbox" checked={layout.wrap} disabled={disabled} onChange={e=>setLayout({wrap:e.target.checked})}/>{t('interface.wrap')}</label><Field name={t('interface.gap')} value={layout.gap} type="number" disabled={disabled} onCommit={v=>run(()=>patch({layout:{...layout,gap:number(v)}}))}/><Choice label={t('interface.align')} value={layout.align} options={option(['start','center','end','stretch'])} disabled={disabled} onChange={v=>setLayout({align:v as InterfaceLayout['align']})}/><div className="grid grid-cols-2 gap-2">{['top','right','bottom','left'].map((edge,index)=><Field key={edge} name={t(`interface.padding.${edge}`)} value={layout.padding[index]} type="number" disabled={disabled} onCommit={v=>run(()=>{const padding=[...layout.padding] as InterfaceLayout['padding'];padding[index]=number(v);patch({layout:{...layout,padding}});})}/>)}</div></>}
  </>}
  <div className="grid grid-cols-2 gap-2">{(['width','height'] as const).map(axis=><Choice key={axis} label={`${t(`interface.${axis}`)} / ${t('interface.sizing')}`} value={sizing[axis]} options={option(['fixed','hug','fill'])} disabled={disabled} onChange={v=>setSizing({[axis]:v})}/>)}</div>
  <div className="grid grid-cols-2 gap-2">{(['minWidth','maxWidth','minHeight','maxHeight'] as const).map(key=><Field key={key} name={t(`interface.${key}`)} value={sizing[key]} type="number" disabled={disabled} onCommit={v=>run(()=>patch({sizing:{...sizing,[key]:number(v)}}))}/>)}</div>
  {parent&&<><label className="flex items-center gap-2 text-xs"><input style={{width:14}} type="checkbox" checked={sizing.absolute} disabled={disabled} onChange={e=>setSizing({absolute:e.target.checked})}/>{t('interface.absolute')}</label>{(!parent.layout||parent.layout.direction==='free'||sizing.absolute)&&<div className="grid grid-cols-2 gap-2">{(['horizontal','vertical'] as const).map(axis=><Choice key={axis} label={t(`interface.${axis}`)} value={node.constraints?.[axis]??'start'} options={option(['start','end','center','stretch','scale'])} disabled={disabled} onChange={v=>run(()=>{const bounds=computeInterfaceLayout(s.document!).bounds.get(parent.id)!;patch({constraints:{horizontal:node.constraints?.horizontal??'start',vertical:node.constraints?.vertical??'start',parentWidth:node.constraints?.parentWidth??bounds.width,parentHeight:node.constraints?.parentHeight??bounds.height,[axis]:v as ConstraintMode}});})}/>)}</div>}</>}
 </div></details>;
}
function InterfaceComponentControls({node,run}:{node:InterfaceNode;run:(f:()=>void)=>void}){
 const s=useInterfaceState(),{t}=useT();const doc=s.document!,owner=owningInstance(doc,node.id),component=doc.components?.find(c=>c.variants.some(v=>v.rootId===node.id));
 const edit=(f:(d:typeof doc)=>void)=>run(()=>interfaceSession.transact(f));
 return <details open className="border-t border-subtle pt-3"><summary className="mb-3 cursor-pointer text-xs font-medium">{t('interface.component')}</summary><div className="flex flex-col gap-2">
  {node.kind==='frame'&&!owner&&!component&&<Button size="compact" variant="outline" disabled={node.locked} onClick={()=>edit(d=>{createComponent(d,node.id,node.name);})}>{t('interface.createComponent')}</Button>}
  {component&&<><span className="text-xs text-ink-2">{component.name}</span><Button size="compact" variant="outline" disabled={node.locked} onClick={()=>run(()=>{let id='';interfaceSession.transact(d=>{id=instantiateComponent(d,component.id,component.variants.find(v=>v.rootId===node.id)!.id,s.pageId!);});interfaceSession.select(id);})}>{t('interface.createInstance')}</Button><Button size="compact" variant="outline" disabled={node.locked} onClick={()=>edit(d=>{addComponentVariant(d,component.id,component.variants.find(v=>v.rootId===node.id)!.id,`${t('interface.variant')} ${component.variants.length+1}`);})}>{t('interface.addVariant')}</Button></>}
  {owner&&<><p className="text-xs text-ink-2">{t('interface.instanceNote')}</p>{owner.id!==node.id?<Button size="compact" variant="outline" onClick={()=>interfaceSession.select(owner.id)}>{t('interface.selectInstance')}</Button>:<><Choice label={t('interface.variant')} value={owner.instance!.variantId} options={doc.components!.find(c=>c.id===owner.instance!.componentId)!.variants.map(v=>[v.id,v.name])} disabled={owner.locked} onChange={id=>edit(d=>switchInstanceVariant(d,owner.id,id))}/><div className="flex flex-wrap gap-1"><Button size="compact" variant="outline" disabled={owner.locked} onClick={()=>edit(d=>resetInstanceOverrides(d,owner.id))}>{t('interface.resetOverrides')}</Button><Button size="compact" variant="outline" disabled={owner.locked} onClick={()=>edit(d=>detachInstance(d,owner.id))}>{t('interface.detach')}</Button><Button size="compact" variant="outline" onClick={()=>{const id=doc.components!.find(c=>c.id===owner.instance!.componentId)!.variants.find(v=>v.id===owner.instance!.variantId)!.rootId;interfaceSession.page(doc.nodes.find(n=>n.id===id)!.pageId);interfaceSession.select(id);}}>{t('interface.goMaster')}</Button></div></>}</>}
 </div></details>;
}
