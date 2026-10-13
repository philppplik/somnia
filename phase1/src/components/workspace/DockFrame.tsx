import {executeCommand} from '../../lib/commands';
import {useEffect,useRef,type ReactNode} from 'react';
import {getStudio} from '../../lib/studios';
import {useAppStore,patchState} from '../../store/appStore';
import {studioPanels,studioDefaultLayout} from '../../lib/shell/codePanels';
import {useShellLayout} from '../../store/shellLayoutStore';
import {useDock,updateDock} from '../../store/dockLayoutStore';
import {type DockSide} from '../../lib/workspace/docking';
import {panelAvailable} from '../../lib/shell/panels';
import {useStudioContext} from '../../lib/shell/studioContext';
import {PanelHost} from '../studios/hosts';
import {useT} from '../../lib/useT';
import './docking.css';
export function DockFrame({children,canvas,communication,leftRail,rightRail,allowed=true}:{children:ReactNode;canvas:ReactNode;communication?:ReactNode;leftRail:ReactNode;rightRail:ReactNode;allowed?:boolean}){
 const state=useAppStore(),studio=getStudio(state.activeStudio),panels=studioPanels(studio),defaults=studioDefaultLayout(studio);
 const d=useDock(studio.id,panels,{left:defaults.leftPanels,right:defaults.rightPanels});
 const railActive=useRef<{studio:string;left?:string;right?:string}>({studio:''});
 const shell=useShellLayout(studio.id,defaults,panels),ctx=useStudioContext(studio.id),{t}=useT();
 // Rail openings join the dock without resetting panels moved to the opposite side.
 useEffect(()=>{if(!d.enabled)return;const left=[...d.left],right=[...d.right];let changed=false;
  for(const [side,opened] of [['left',shell.leftPanels],['right',shell.rightPanels]] as const)for(const id of opened){if(!left.includes(id)&&!right.includes(id)){(side==='left'?left:right).push(id);changed=true;}}
  const previous=railActive.current;railActive.current={studio:studio.id,left:shell.activeLeft,right:shell.activeRight};
  const next={...d,left,right};
  if(previous.studio===studio.id)for(const [old,id] of [[previous.left,shell.activeLeft],[previous.right,shell.activeRight]])if(id&&id!==old){if(left.includes(id))next.activeLeft=id;else if(right.includes(id))next.activeRight=id;changed=true;}
  if(changed)updateDock(studio.id,next);
 },[studio.id,d,shell]);
 if(!d.enabled||!panels.length||!allowed)return <>{children}</>;
 const move=(id:string,side:DockSide,index?:number)=>void executeCommand('workspace.movePanel',{id,side,...(index===undefined?{}:{index})});
 const group=(side:DockSide)=>{
  const key=side==='left'?'activeLeft':'activeRight',ids=d[side].filter(id=>panels.some(p=>p.id===id&&panelAvailable(p,ctx))),active=ids.includes(d[key]??'')?d[key]:ids[0];
  const select=(id:string)=>{updateDock(studio.id,{...d,[key]:id});const p=panels.find(p=>p.id===id);if(studio.id==='code'&&p)patchState(p.side==='left'?{leftTab:id as typeof state.leftTab}:{rightTab:id as typeof state.rightTab});};
  return <aside hidden={side==='left'?!state.sidebarOpen:!state.inspectorOpen} className="workspace-dock" aria-label={t(side==='left'?'workspace.left':'workspace.right')} onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-somnia-panel')){e.preventDefault();e.dataTransfer.dropEffect='move';}}} onDrop={e=>{const id=e.dataTransfer.getData('application/x-somnia-panel');if(panels.some(p=>p.id===id)){e.preventDefault();move(id,side);}}}>
   <div className="workspace-dock-tabs" role="tablist">{ids.map((id,index)=>{const p=panels.find(p=>p.id===id)!;return <button key={id} id={`dock-tab-${studio.id}-${id}`} role="tab" aria-controls={`dock-pane-${studio.id}-${id}`} aria-selected={active===id} tabIndex={active===id?0:-1} draggable onDragStart={e=>{e.dataTransfer.setData('application/x-somnia-panel',id);e.dataTransfer.effectAllowed='move';}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();move(e.dataTransfer.getData('application/x-somnia-panel'),side,index);}} onClick={()=>select(id)} onKeyDown={e=>{const step=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;const next=e.key==='Home'?ids[0]:e.key==='End'?ids.at(-1):step?ids[(index+step+ids.length)%ids.length]:undefined;if(next){e.preventDefault();select(next);document.getElementById(`dock-tab-${studio.id}-${next}`)?.focus();}}}>{p.titleKey?t(p.titleKey):t(`workspace.panel.${id}`)===`workspace.panel.${id}`?p.title:t(`workspace.panel.${id}`)}</button>;})}</div>
   {active&&<div className="workspace-dock-actions"><button onClick={()=>move(active,side==='left'?'right':'left')}>{t(side==='left'?'workspace.right':'workspace.left')}</button></div>}
   {!ids.length&&<p className="workspace-dock-empty">{t('workspace.empty')}</p>}
   {ids.map(id=><section key={id} id={`dock-pane-${studio.id}-${id}`} role="tabpanel" aria-labelledby={`dock-tab-${studio.id}-${id}`} hidden={active!==id} className="workspace-dock-content"><PanelHost panel={panels.find(p=>p.id===id)!}/></section>)}
  </aside>;
 };
 return <div className="workspace-dock-frame">{leftRail}{group('left')}<div className="workspace-dock-canvas">{canvas}</div>{group('right')}{communication}{rightRail}</div>;
}
