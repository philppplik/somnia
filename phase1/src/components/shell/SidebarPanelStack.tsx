import type {ReactNode} from 'react';
import {stackPanels} from '../../lib/shell/panels';
import {useStudioContext} from '../../lib/shell/studioContext';
import {useT} from '../../lib/useT';
import {studioDefaultLayout,studioPanels} from '../../lib/shell/codePanels';
import {getStudio} from '../../lib/studios';
import {patchState,useAppStore} from '../../store/appStore';
import {editPanelStack,shellLayoutStore,useShellLayout} from '../../store/shellLayoutStore';
import {PanelHost} from '../studios/hosts';
/** Single-panel compatibility mode is deliberately wrapper-free for zero-pixel Code snapshots. */
export function SidebarPanelStack({side,legacy}:{side:'left'|'right';legacy:ReactNode}){
 const state=useAppStore(),studio=getStudio(state.activeStudio),panels=studioPanels(studio),defaults=studioDefaultLayout(studio);
 const layout=useShellLayout(studio.id,defaults,panels);const ctx=useStudioContext(studio.id);const {t}=useT();
 if(!panels.length)return <>{legacy}</>;
 const key=side==='left'?'leftPanels':'rightPanels';
 const opened=stackPanels(panels,side,layout[key],ctx),railCount=opened.filter(p=>p.placement!=='docked').length,title=(p:{title:string;titleKey?:string})=>p.titleKey?t(p.titleKey):p.title;
 const collapse=(id:string)=>{const collapsed=layout.collapsedPanels??[];shellLayoutStore.update(studio.id,{collapsedPanels:collapsed.includes(id)?collapsed.filter(p=>p!==id):[...collapsed,id]},defaults,panels);};
 const edit=(id:string,action:'close'|'focus',to?:number)=>{const next=shellLayoutStore.update(studio.id,editPanelStack(layout,side,id,action,to),defaults,panels);patchState(side==='left'?{sidebarOpen:next.leftOpen,...(studio.id==='code'&&next.activeLeft?{leftTab:next.activeLeft as typeof state.leftTab}:{})}:{inspectorOpen:next.rightOpen,...(studio.id==='code'&&next.activeRight?{rightTab:next.activeRight as typeof state.rightTab}:{})});};
 if(opened.length===1&&!(layout.collapsedPanels??[]).includes(opened[0].id))return <PanelHost panel={opened[0]}/>;
 if(!opened.length)return null;
 return <div className="flex h-full min-h-0 flex-col gap-1 overflow-auto" aria-label={`${side} panel stack`}>{opened.map((panel,index)=><section key={panel.id} className="flex min-h-0 flex-col" style={{flex:!(layout.collapsedPanels??[]).includes(panel.id)?1:undefined,minHeight:!(layout.collapsedPanels??[]).includes(panel.id)?panel.minHeight:undefined}}><div className="flex items-center rounded-sm bg-panel px-2 text-xs"><button className="flex-1 py-2 text-left" aria-expanded={!(layout.collapsedPanels??[]).includes(panel.id)} onClick={()=>collapse(panel.id)}>{title(panel)}</button>{panel.placement!=='docked'&&<><button aria-label={`Move ${title(panel)} up`} disabled={index===0} onClick={()=>edit(panel.id,'focus',index-1)}>↑</button><button aria-label={`Move ${title(panel)} down`} disabled={index===railCount-1} onClick={()=>edit(panel.id,'focus',index+1)}>↓</button><button aria-label={`Close ${title(panel)} panel`} onClick={()=>edit(panel.id,'close')}>×</button></>}</div>{!(layout.collapsedPanels??[]).includes(panel.id)&&<div className="min-h-0 flex-1 overflow-auto"><PanelHost panel={panel}/></div>}</section>)}</div>;
}
