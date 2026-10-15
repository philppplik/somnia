import type {VectorDocument,VectorPath} from '../vectorio';
import {selectedPaths} from './selectionClosure';
import {newId} from './shapes';

const objKey=(p:VectorPath)=>p.compound?'c:'+p.compound:'p:'+p.id;
/** A clipping mask is an editor group in which the paths flagged `clip` are the mask shape: they are not painted, and the other members are only visible inside them. */
export const hasClip=(paths:readonly VectorPath[])=>paths.some(p=>p.clip===true);
/** Refuses an operation that would consume or split a mask shape (it would silently lose the mask). */
export function refuseClipped(doc:VectorDocument,ids:readonly string[],action:string):void{
 if(hasClip(selectedPaths(doc,ids)))throw Error(`Release the clipping mask before you ${action}`);
}
/** Make a clipping mask: the topmost selected object becomes the mask shape for the others (>= 2 objects, none already grouped). The mask keeps its own style, which is not painted. */
export function makeClip(doc:VectorDocument,ids:readonly string[]):VectorDocument{
 const sel=selectedPaths(doc,ids),objs=new Set(sel.map(objKey));
 if(objs.size<2)throw Error('Select at least two objects: the topmost becomes the mask');
 if(sel.some(p=>p.group!==undefined))throw Error('Ungroup or release the selected groups first');
 const top=sel.reduce((a,p)=>doc.paths.indexOf(p)>doc.paths.indexOf(a)?p:a),maskKey=objKey(top);
 const used=new Set(doc.paths.map(p=>p.group));let g:string;do{g=newId('g');}while(used.has(g));
 const inSel=new Set(sel.map(p=>p.id)),at=Math.max(...sel.map(p=>doc.paths.indexOf(p)));
 const members=sel.filter(p=>objKey(p)!==maskKey).map(p=>({...p,group:g})),mask=sel.filter(p=>objKey(p)===maskKey).map(p=>({...p,group:g,clip:true as const}));
 const rest:VectorPath[]=[];
 doc.paths.forEach((p,i)=>{if(!inSel.has(p.id))rest.push(p);else if(i===at)rest.push(...members,...mask);});
 return {...doc,paths:rest};
}
/** Release the mask of every selected clipping group: the shape becomes an ordinary path again, the group stays. */
export function releaseClip(doc:VectorDocument,ids:readonly string[]):VectorDocument{
 const inSel=new Set(selectedPaths(doc,ids).filter(p=>p.clip).map(p=>p.id));
 if(!inSel.size)throw Error('No clipping mask in the selection');
 return {...doc,paths:doc.paths.map(p=>{if(!inSel.has(p.id))return p;const {clip:_c,...q}=p;return q;})};
}
