import type {PanelDef} from '../shell/types';
export type DockSide='left'|'right';
export interface DockLayout {enabled:boolean;left:string[];right:string[];activeLeft?:string;activeRight?:string}
export function cleanDock(input:unknown,panels:readonly PanelDef[],defaults:{left:string[];right:string[]}):DockLayout{
 const x=(input&&typeof input==='object'?input:defaults) as Partial<DockLayout>;
 const seen=new Set<string>();const ids=new Set(panels.map(p=>p.id));
 const clean=(v:unknown)=>Array.isArray(v)?v.filter((id):id is string=>typeof id==='string'&&ids.has(id)&&!seen.has(id)&&(seen.add(id),true)):[];
 const left=clean(x.left),right=clean(x.right);
 return{enabled:x.enabled===true,left,right,activeLeft:left.includes(x.activeLeft??'')?x.activeLeft:left[0],activeRight:right.includes(x.activeRight??'')?x.activeRight:right[0]};
}
export function moveDock(layout:DockLayout,id:string,side:DockSide,index?:number):DockLayout{
 if(![...layout.left,...layout.right].includes(id))return layout;
 const left=layout.left.filter(p=>p!==id),right=layout.right.filter(p=>p!==id),target=side==='left'?left:right;
 target.splice(Math.max(0,Math.min(index??target.length,target.length)),0,id);
 return{...layout,left,right,activeLeft:side==='left'?id:left.includes(layout.activeLeft??'')?layout.activeLeft:left[0],activeRight:side==='right'?id:right.includes(layout.activeRight??'')?layout.activeRight:right[0]};
}
