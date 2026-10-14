import type {KeyRef} from './model';
/** The selection without the earliest and latest selected key of each property. Properties with two or fewer selected keys drop out. */
export function shrinkSelection(sel:readonly KeyRef[]):KeyRef[]{
 const groups=new Map<string,KeyRef[]>();
 for(const r of sel){const g=r.layer+'\u0000'+r.prop,a=groups.get(g);if(a)a.push(r);else groups.set(g,[r]);}
 const out:KeyRef[]=[];
 for(const a of groups.values()){
  const s=[...a].sort((x,y)=>x.t-y.t);
  for(let i=1;i<s.length-1;i++)out.push(s[i]);
 }
 return out;
}
