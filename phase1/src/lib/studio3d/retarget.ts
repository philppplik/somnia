/** Bone-name mapping for clip retargeting between two rigs, plus shared errors. Pure: no three.js. */
export class RetargetError extends Error{override name='RetargetError';}
/** Upper bound of samples written into a retargeted clip. */
export const MAX_RETARGET_SAMPLES=120;
/** Normalises a bone name for matching: lowercase, namespace prefixes (mixamorig:, Armature|) stripped, separators removed. */
export function normalizeBoneName(name:string):string{
 const cut=Math.max(name.lastIndexOf(':'),name.lastIndexOf('|'));
 return(cut>=0?name.slice(cut+1):name).toLowerCase().replace(/[\s_.\-]+/g,'');
}
/** Maps source bone names onto target bone names: exact matches first, then normalised ones; every target bone pairs at most once, in source order. */
export function mapBoneNames(source:readonly string[],target:readonly string[]):{pairs:{source:string;target:string}[];unmatchedSource:string[];unmatchedTarget:string[]}{
 const used=new Set<string>();const pairs:{source:string;target:string}[]=[];const unmatchedSource:string[]=[];
 const exact=new Map(target.map(t=>[t,t]));
 const normal=new Map<string,string>();
 for(const t of target){const n=normalizeBoneName(t);if(n&&!normal.has(n))normal.set(n,t);}
 for(const s of source){
  const hit=(exact.get(s)&&!used.has(s))?s:normal.get(normalizeBoneName(s));
  if(hit!==undefined&&!used.has(hit)){used.add(hit);pairs.push({source:s,target:hit});}
  else unmatchedSource.push(s);
 }
 return{pairs,unmatchedSource,unmatchedTarget:target.filter(t=>!used.has(t))};
}
/** Name of the clip a retarget creates. */
export function retargetClipName(clipName:string):string{return`Retarget: ${clipName}`;}
