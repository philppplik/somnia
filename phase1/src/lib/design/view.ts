import {useSyncExternalStore} from 'react';
/** View state of the Design canvas (zoom and measured viewport). Not part of the document, never dirty. */
export const ZOOM_STEPS=[0.1,0.25,0.5,0.65,0.75,1,1.5,2,3,4] as const;
export interface DesignView{zoom:number;viewport:{width:number;height:number}|null}
let view:DesignView={zoom:0.65,viewport:null};
const listeners=new Set<()=>void>();
const emit=(next:DesignView)=>{view=next;listeners.forEach(f=>f());};
export const getDesignView=()=>view;
export const useDesignView=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f);},getDesignView,getDesignView);
export const clampZoom=(z:number)=>Math.min(4,Math.max(0.1,Math.round(z*100)/100));
export function setDesignZoom(zoom:number){if(Number.isFinite(zoom)&&clampZoom(zoom)!==view.zoom)emit({...view,zoom:clampZoom(zoom)});}
/** Next preset step above (1) or below (-1) the current zoom. */
export function stepDesignZoom(direction:1|-1){
 const z=view.zoom;const next=direction>0?ZOOM_STEPS.find(s=>s>z+1e-9):[...ZOOM_STEPS].reverse().find(s=>s<z-1e-9);
 if(next!==undefined)setDesignZoom(next);
}
export function setDesignViewport(viewport:{width:number;height:number}|null){
 const a=view.viewport;if(a===viewport||(a&&viewport&&a.width===viewport.width&&a.height===viewport.height))return;emit({...view,viewport});
}
