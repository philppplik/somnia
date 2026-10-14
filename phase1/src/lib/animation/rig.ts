import type {Composition} from './model';
import type {Edit} from './edit';
/** Rig helpers: pure edit builders. They keep the world pose (keepWorld) and are applied as one batch, so they are one undo step and all-or-nothing. */
export const MAX_RIG_LAYERS=20;
export class RigError extends Error{constructor(message:string){super(message);this.name='RigError';}}
const pick=(c:Composition,ids:readonly string[],min:number)=>{
 const u=[...new Set(ids)];
 if(u.length<min)throw new RigError(min>1?'Pick at least two layers.':'Pick at least one layer.');
 if(u.length>MAX_RIG_LAYERS)throw new RigError(`Pick at most ${MAX_RIG_LAYERS} layers.`);
 const ls=u.map(id=>c.layers.find(l=>l.id===id));
 if(ls.some(l=>!l))throw new RigError('A picked layer no longer exists.');
 if(ls.some(l=>l!.locked))throw new RigError('A picked layer is locked.');
 return u;
};
/** Chain: ids[0] stays where it is, ids[1] becomes its child, ids[2] the child of ids[1], and so on. */
export const chainEdits=(c:Composition,ids:readonly string[],t:number):Edit[]=>{const u=pick(c,ids,2);return u.slice(1).map((id,i):Edit=>({type:'layer.parent',layer:id,parent:u[i],keepWorld:true,t}));};
/** Group: a new control null (named "Rig") and every picked layer parented to it. */
export const groupEdits=(c:Composition,ids:readonly string[],nullId:string,t:number):Edit[]=>{
 const u=pick(c,ids,1);
 return [{type:'layer.add',kind:'null',id:nullId,over:{name:'Rig'}},...u.map((id):Edit=>({type:'layer.parent',layer:id,parent:nullId,keepWorld:true,t}))];
};
/** Release: picked layers that have a parent lose it. Layers without a parent are left alone; nothing to release is an error. */
export const releaseEdits=(c:Composition,ids:readonly string[],t:number):Edit[]=>{
 const u=pick(c,ids,1).filter(id=>c.layers.find(l=>l.id===id)!.parent!==null);
 if(!u.length)throw new RigError('None of the picked layers has a parent.');
 return u.map((id):Edit=>({type:'layer.parent',layer:id,parent:null,keepWorld:true,t}));
};
