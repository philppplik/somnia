import type {PanelDef,RailItemDef,StudioLayout} from './types';
import type {StudioDef} from '../studios/registry';
/** Code's existing panel chrome remains owned by its hosts. A single panel adds no shell chrome. */
export const CODE_PANELS:readonly PanelDef[]=[
 ...['layers','files','search','components','css','versions'].map(id=>({id,title:id==='css'?'CSS':id[0].toUpperCase()+id.slice(1),component:`code.${id}`,side:'left' as const,defaultOpen:id==='layers'})),
 ...['design','prototype','code'].map(id=>({id,title:id[0].toUpperCase()+id.slice(1),component:`code.${id}`,side:'right' as const,defaultOpen:id==='design'}))
];
export const CODE_LAYOUT:StudioLayout={leftOpen:true,rightOpen:true,leftWidth:260,rightWidth:320,leftPanels:['layers'],rightPanels:['design'],activeLeft:'layers',activeRight:'design'};
export function studioPanels(studio:StudioDef):readonly PanelDef[]{return studio.shellV2?.panels?.length?studio.shellV2.panels:studio.id==='code'?CODE_PANELS:[];}
export function studioDefaultLayout(studio:StudioDef):StudioLayout{return studio.shellV2?.defaultLayout??CODE_LAYOUT;}
/** Additive adapter: M2 can own menus without prematurely taking over the panel/rail surface. */
export function studioRail(studio:StudioDef,side:'left'|'right'):readonly RailItemDef[]{
 const declared=side==='left'?studio.shellV2?.leftRail:studio.shellV2?.rightRail;
 if(declared?.length)return declared;
 return (side==='left'?studio.shell.leftRail:studio.shell.rightRail).map((i,n)=>({...i,kind:'panel',panel:i.id,order:n*10,defaultPinned:true}));
}
