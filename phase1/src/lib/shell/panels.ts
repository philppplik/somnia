import {INSPECTOR_HOST,type InspectorSectionDef,type PanelDef,type RailItemDef,type StudioShellDef} from './types';
import {evalWhen,validateWhen} from './when';
import {isNamespacedId} from './commandMeta';
/**
 * Pure panel helpers shared by the side stack, the rail and the validator.
 * `when` expressions read the merged StudioContext (`selection.kind`, `mode`, `document.kind`, `services.x`...).
 */
export const panelAvailable=(p:Pick<PanelDef,'when'>,ctx:unknown)=>evalWhen(p.when,ctx);
/** Panels the user can reach from a rail item (placement 'rail', the default) and whose `when` holds. */
export const railPanels=(panels:readonly PanelDef[],side:'left'|'right',ctx:unknown)=>panels.filter(p=>p.side===side&&(p.placement??'rail')==='rail'&&panelAvailable(p,ctx));
/** Docked panels of one side whose `when` holds, in declaration order. */
export const dockedPanels=(panels:readonly PanelDef[],side:'left'|'right',ctx:unknown)=>panels.filter(p=>p.side===side&&p.placement==='docked'&&panelAvailable(p,ctx));
/**
 * The ordered stack to render for a side: the user's opened `rail` panels (layout order, only available ones)
 * followed by the docked panels that currently apply. Pure.
 */
export function stackPanels(panels:readonly PanelDef[],side:'left'|'right',opened:readonly string[],ctx:unknown):PanelDef[]{
 const open=opened.map(id=>panels.find(p=>p.id===id&&p.side===side&&(p.placement??'rail')==='rail')).filter((p):p is PanelDef=>!!p&&panelAvailable(p,ctx));
 return [...open,...dockedPanels(panels,side,ctx)];
}
export interface ShellValidationOpts{
 commandExists?:(id:string)=>boolean;
 hostExists?:(component:string)=>boolean;
 sectionHostExists?:(component:string)=>boolean;
 iconExists?:(name:string)=>boolean;
}
/**
 * Manifest sanity for a studio's shellV2 (authoring-time, used by unit tests and check scripts).
 * Returns human-readable problems; empty = ok. Never throws.
 */
export function validateStudioShell(studio:string,def:StudioShellDef,o:ShellValidationOpts={}):string[]{
 const p:string[]=[];
 const panels=def.panels??[],rails:[string,readonly RailItemDef[]][]=[['leftRail',def.leftRail??[]],['rightRail',def.rightRail??[]]];
 const dup=(label:string,ids:string[])=>{const seen=new Set<string>();for(const i of ids){if(seen.has(i))p.push(`${studio}: duplicate ${label} id "${i}"`);seen.add(i);}};
 dup('panel',panels.map(x=>x.id));dup('tool',(def.tools??[]).map(x=>x.id));
 rails.forEach(([k,items])=>dup(k,items.map(x=>x.id)));
 const checkWhen=(where:string,w?:string)=>{if(w!==undefined){const e=validateWhen(w);if(e)p.push(`${studio}: ${where}: ${e}`);}};
 const cmd=(where:string,id:string)=>{
  if(!isNamespacedId(id))p.push(`${studio}: ${where}: command "${id}" is not namespaced`);
  else if(o.commandExists&&!o.commandExists(id))p.push(`${studio}: ${where}: command "${id}" is not registered`);
 };
 for(const x of panels){
  if(!x.component)p.push(`${studio}: panel "${x.id}" has no component`);
  else if(o.hostExists&&!o.hostExists(x.component))p.push(`${studio}: panel "${x.id}" host "${x.component}" is not registered`);
  checkWhen(`panel "${x.id}"`,x.when);
  (x.commands??[]).forEach(c=>cmd(`panel "${x.id}"`,c));
  if(x.icon&&o.iconExists&&!o.iconExists(x.icon))p.push(`${studio}: panel "${x.id}" icon "${x.icon}" is unknown`);
 }
 const toolIds=new Set((def.tools??[]).map(t=>t.id));
 for(const [k,items] of rails)for(const it of items){
  const where=`${k} item "${it.id}"`;
  checkWhen(where,it.when);
  if(o.iconExists&&!o.iconExists(it.icon))p.push(`${studio}: ${where} icon "${it.icon}" is unknown`);
  const side=k==='leftRail'?'left':'right';
  if(it.kind==='panel'){
   const target=panels.find(x=>x.id===it.panel);
   if(!it.panel||!target)p.push(`${studio}: ${where} points at unknown panel "${it.panel??''}"`);
   else if(target.side!==side)p.push(`${studio}: ${where} opens panel "${target.id}" which lives on the ${target.side}`);
   else if(target.placement==='docked')p.push(`${studio}: ${where} points at docked panel "${target.id}" (docked panels have no rail item)`);
  }else if(it.kind==='tool'){
   if(!it.tool||!toolIds.has(it.tool))p.push(`${studio}: ${where} points at unknown tool "${it.tool??''}"`);
  }else if(!it.command)p.push(`${studio}: ${where} (kind ${it.kind}) needs a command`);
  else cmd(where,it.command);
 }
 for(const t of def.tools??[]){cmd(`tool "${t.id}"`,t.command);if(t.opensPanel&&!panels.some(x=>x.id===t.opensPanel))p.push(`${studio}: tool "${t.id}" opens unknown panel "${t.opensPanel}"`);}
 if(def.inspector){
  const ins=def.inspector;dup('inspector section',ins.sections.map(x=>x.id));
  if(!panels.some(x=>x.component===INSPECTOR_HOST))p.push(`${studio}: inspector sections need a panel with component "${INSPECTOR_HOST}"`);
  for(const x of ins.sections){
   const where=`inspector section "${x.id}"`;checkWhen(where,x.when);(x.commands??[]).forEach(c=>cmd(where,c));
   if(!x.component)p.push(`${studio}: ${where} has no component`);else if(o.sectionHostExists&&!o.sectionHostExists(x.component))p.push(`${studio}: ${where} host "${x.component}" is not registered`);
  }
 }
 if(def.defaultLayout){
  for(const [side,ids] of [['left',def.defaultLayout.leftPanels],['right',def.defaultLayout.rightPanels]] as const)
   for(const id of ids)if(!panels.some(x=>x.id===id&&x.side===side))p.push(`${studio}: defaultLayout ${side} lists unknown panel "${id}"`);
 }
 return p;
}

/** Sections to render now: `when` holds, sorted by `order` (stable). Pure. */
export function resolveInspectorSections(defs:readonly InspectorSectionDef[],ctx:unknown):InspectorSectionDef[]{
 return defs.map((d,i)=>({d,i})).filter(({d})=>evalWhen(d.when,ctx)).sort((a,b)=>(a.d.order??0)-(b.d.order??0)||a.i-b.i).map(x=>x.d);
}
