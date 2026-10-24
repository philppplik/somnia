import type {KeyRef} from './model';
export const MIN_NTH=2,MAX_NTH=8;
/** Keep every n-th key of the selection, counted per layer property in time order, starting at `offset` (0..n-1). */
export function nthKeys(sel:readonly KeyRef[],n:number,offset=0):KeyRef[]{
 if(!Number.isInteger(n)||n<MIN_NTH||n>MAX_NTH)throw Object.assign(new Error(`Pick a step from ${MIN_NTH} to ${MAX_NTH}.`),{expected:true});
 if(!Number.isInteger(offset)||offset<0||offset>=n)throw Object.assign(new Error('Offset must be below the step.'),{expected:true});
 const groups=new Map<string,KeyRef[]>();
 for(const k of sel){const id=`${k.layer}\u0000${k.prop}`,g=groups.get(id);if(g)g.push(k);else groups.set(id,[k]);}
 const out:KeyRef[]=[];
 groups.forEach(g=>{g.sort((a,b)=>a.t-b.t);g.forEach((k,i)=>{if(i%n===offset)out.push(k);});});
 return out;
}
