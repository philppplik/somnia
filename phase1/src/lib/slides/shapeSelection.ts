import {useSyncExternalStore} from 'react';
/** Ephemeral shape selection bound to one deck source and slide id. Validity is re-checked on every read. */
export interface ShapeSelection {source:string;slideId:number;shapeId:number}
let selection:ShapeSelection|null=null;const listeners=new Set<()=>void>();
export const getShapeSelection=()=>selection;
export function selectShape(value:ShapeSelection|null){if(selection===value)return;selection=value;listeners.forEach(f=>f());}
const subscribe=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
export const useShapeSelection=()=>useSyncExternalStore(subscribe,getShapeSelection,getShapeSelection);
