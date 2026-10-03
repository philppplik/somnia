import type {LucideIcon} from 'lucide-react';
import {Files,Layers,Image,Boxes,SlidersHorizontal,Play,Code2} from 'lucide-react';
import {Button} from './ui/button';
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
  if(open&&active===id){patchState(side==='left'?{sidebarOpen:false}:{inspectorOpen:false});return;}
  patchState(side==='left'?{leftTab:id as AppState['leftTab'],sidebarOpen:true}:{rightTab:id as AppState['rightTab'],inspectorOpen:true});
 };
 return <div role="toolbar" aria-orientation="vertical" aria-label={side==='left'?'Sidebar panels':'Inspector panels'} className="flex w-11 shrink-0 flex-col items-center gap-1 pt-2">
  {items.map(({id,label,icon:Icon})=><Button key={id} size="icon" title={label} aria-label={`${label} panel`} aria-pressed={open&&active===id} className={cn(open&&active===id&&'bg-accent-soft text-accent')} onClick={()=>choose(id)}><Icon/></Button>)}
 </div>;
}
