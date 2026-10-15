import type {VectorDocument,VectorPath} from '../vectorio';
import {selectedPaths} from './selectionClosure';
import {newId} from './shapes';
import {refuseClipped} from './clip';

/** Group the selected objects (>= 2). Members become contiguous at the topmost member's stacking position, relative order kept.
 *  Existing groups inside the selection are merged (groups do not nest). Returns the same doc when there is nothing to do. */
export function groupSelection(doc:VectorDocument,ids:readonly string[]):VectorDocument{
  refuseClipped(doc,ids,'group');
  const members=selectedPaths(doc,ids);
  if(new Set(members.map(p=>p.compound?'c:'+p.compound:'p:'+p.id)).size<2)return doc;
  const used=new Set(doc.paths.map(p=>p.group));let id:string;do{id=newId('g');}while(used.has(id));
  const inSel=new Set(members.map(p=>p.id)),top=Math.max(...members.map(p=>doc.paths.indexOf(p)));
  const rest:VectorPath[]=[];
  doc.paths.forEach((p,i)=>{if(!inSel.has(p.id))rest.push(p);else if(i===top)for(const m of members)rest.push({...m,group:id});});
  return {...doc,paths:rest};
}
/** Remove the group of every selected object; paths stay where they are. */
export function ungroupSelection(doc:VectorDocument,ids:readonly string[]):VectorDocument{
  const inSel=new Set(selectedPaths(doc,ids).map(p=>p.id));
  if(!doc.paths.some(p=>inSel.has(p.id)&&p.group!==undefined))return doc;
  return {...doc,paths:doc.paths.map(p=>{if(!inSel.has(p.id)||p.group===undefined)return p;const {group:_g,clip:_c,...q}=p;return q;})};
}
