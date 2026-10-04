import type {LucideIcon} from 'lucide-react';
import {PanelLeft,PanelRight,Files,Layers,Image,Boxes,SlidersHorizontal,Play,Code2,Puzzle} from 'lucide-react';
import {Button} from './ui/button';
import {executeCommand} from '../lib/commands';
import {patchState,useAppStore} from '../store/appStore';
import type {AppState} from '../store/appStore';
import {cn} from '../lib/cn';
type Item<T extends string>={id:T;label:string;icon:LucideIcon};
const left:Item<AppState['leftTab']>[]=[{id:'layers',label:'Layers',icon:Layers},{id:'files',label:'Files',icon:Files},{id:'assets',label:'Assets',icon:Image},{id:'components',label:'Components',icon:Boxes}];
const right:Item<AppState['rightTab']>[]=[{id:'design',label:'Design',icon:SlidersHorizontal},{id:'prototype',label:'Prototype',icon:Play},{id:'code',label:'Code',icon:Code2}];
/** Narrow icon strip beside each side panel. Always visible; a click opens that panel, a second click on the active icon collapses it. */
export function IconRail({side}:{side:'left'|'right'}){
 const s=useAppStore();const items=side==='left'?left:right;const open=side==='left'?s.sidebarOpen:s.inspectorOpen;const active=side==='left'?s.leftTab:s.rightTab;
 const choose=(id:string)=>{
  patchState({activePanel:{...s.activePanel,[side]:null}});
  if(open&&active===id&&!s.activePanel[side]){patchState(side==='left'?{sidebarOpen:false}:{inspectorOpen:false});return;}
  patchState(side==='left'?{leftTab:id as AppState['leftTab'],sidebarOpen:true}:{rightTab:id as AppState['rightTab'],inspectorOpen:true});
 };
 return <div role="toolbar" aria-orientation="vertical" onKeyDown={e=>{const k=e.key;if(!["ArrowDown","ArrowUp","Home","End"].includes(k))return;const b=[...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];const i=b.indexOf(document.activeElement as HTMLButtonElement);if(i<0)return;e.preventDefault();b[k==="Home"?0:k==="End"?b.length-1:(i+(k==="ArrowDown"?1:-1)+b.length)%b.length].focus();}} aria-label={side==='left'?'Sidebar panels':'Inspector panels'} className="flex w-11 shrink-0 flex-col items-center gap-1 pt-2">
  <Button size="icon" aria-label={side==='left'?'Toggle sidebar':'Toggle inspector'} title={side==='left'?'Toggle sidebar (Ctrl+B)':'Toggle inspector (Ctrl+Alt+I)'} aria-pressed={open} onClick={()=>void executeCommand(side==='left'?'sidebar.toggle':'inspector.toggle')}>{side==='left'?<PanelLeft/>:<PanelRight/>}</Button>
  <span className="my-1 h-px w-6 bg-line"/>
  {s.extensionPanels.filter(p=>p.side===side).map(p=><Button key={p.id} size="icon" title={p.title} aria-label={`${p.title} panel (extension)`} aria-pressed={open&&s.activePanel[side]===p.id} className={cn(open&&s.activePanel[side]===p.id&&'bg-accent-soft text-accent')} onClick={()=>{const on=open&&s.activePanel[side]===p.id;patchState({activePanel:{...s.activePanel,[side]:on?null:p.id},...(side==='left'?{sidebarOpen:!on}:{inspectorOpen:!on})});}}><Puzzle/></Button>)}
  {items.map(({id,label,icon:Icon})=><Button key={id} size="icon" title={label} aria-label={`${label} panel`} aria-pressed={open&&active===id} className={cn(open&&active===id&&'bg-accent-soft text-accent')} onClick={()=>choose(id)}><Icon/></Button>)}
 </div>;
}
