import type {ComponentType} from 'react';
import {resolveInspectorSections} from '../../lib/shell/panels';
import type {InspectorSectionProps,PanelHostProps} from '../../lib/shell/types';
import {getStudio} from '../../lib/studios';
import {useT} from '../../lib/useT';
import {usePanelState} from '../../store/panelStateStore';
/** Explicit allowlist of inspector section hosts, like panel hosts: a manifest names ids, never modules. */
const sectionHosts=new Map<string,ComponentType<InspectorSectionProps>>();
export function registerInspectorSection(id:string,Host:ComponentType<InspectorSectionProps>){
 if(sectionHosts.has(id))throw new Error(`Duplicate inspector section host: ${id}`);
 sectionHosts.set(id,Host);return()=>{if(sectionHosts.get(id)===Host)sectionHosts.delete(id);};
}
export const hasInspectorSection=(id:string)=>sectionHosts.has(id);
/**
 * Generic inspector for any studio (`shellV2.inspector`). It owns the chrome (title, collapsible sections,
 * empty state, persisted collapse state); the studio owns what each section shows.
 */
export function InspectorPanel({panelId,context}:PanelHostProps){
 const {t}=useT();const def=getStudio(context.studio).shellV2?.inspector;
 const sections=resolveInspectorSections(def?.sections??[],context);
 const [collapsed,setCollapsed]=usePanelState<string[]>(`${context.studio}.${panelId}.collapsed`,(def?.sections??[]).filter(s=>s.defaultCollapsed).map(s=>s.id));
 const toggle=(id:string)=>setCollapsed(collapsed.includes(id)?collapsed.filter(x=>x!==id):[...collapsed,id]);
 return <aside className="panel inspector grid min-h-0 content-start overflow-auto" aria-label={t(def?.titleKey??'shell.inspector.title')} data-testid="shell-inspector" data-studio={context.studio}>
  {sections.length===0&&<p className="p-3 text-[12px] text-ink-3" data-testid="shell-inspector-empty">{t(def?.emptyKey??'shell.inspector.empty')}</p>}
  {sections.map(sec=>{
   const Host=sectionHosts.get(sec.component);if(!Host)throw new Error(`Inspector section unavailable: ${sec.component}`);
   const open=!collapsed.includes(sec.id),title=sec.titleKey?t(sec.titleKey):sec.title;
   return <section key={sec.id} data-testid={`inspector-section-${sec.id}`} aria-label={title} className="border-b border-subtle">
    <button type="button" className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-[12px] font-medium text-ink" aria-expanded={open} onClick={()=>toggle(sec.id)}>
     <span aria-hidden="true" className="inline-block w-3 text-ink-3">{open?'▾':'▸'}</span>{title}</button>
    {open&&<div className="px-3 pb-3"><Host sectionId={sec.id} context={context}/></div>}
   </section>;
  })}
 </aside>;
}
