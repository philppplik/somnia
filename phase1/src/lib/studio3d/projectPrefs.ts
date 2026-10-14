import {isUnit,type ExportUnit} from './model';
/** Export unit per project, kept in local storage under the project name. No 3D scene data is stored here. */
const KEY='somnia.studio3d.units.v1';const MAX=200;
export interface KeyValueStore{getItem(k:string):string|null;setItem(k:string,v:string):void}
function readAll(store:KeyValueStore):Record<string,ExportUnit>{
 try{const raw=JSON.parse(store.getItem(KEY)||'{}');const out:Record<string,ExportUnit>={};
  if(raw&&typeof raw==='object'&&!Array.isArray(raw))for(const [k,v] of Object.entries(raw))if(isUnit(v))out[k]=v;return out;}catch{return{};}
}
export const readProjectUnit=(store:KeyValueStore,project:string):ExportUnit=>readAll(store)[project]??'m';
export function writeProjectUnit(store:KeyValueStore,project:string,unit:ExportUnit){
 try{const all=readAll(store);delete all[project];if(unit!=='m')all[project]=unit;
  const keys=Object.keys(all);for(const k of keys.slice(0,Math.max(0,keys.length-MAX)))delete all[k];
  store.setItem(KEY,JSON.stringify(all));}catch{/* session only */}
}
