/** Next/previous studio id in a ring. Pure: callers pass the studio ids in registration order. Unknown or missing active id starts from the first (or last when going back). */
export function cycleStudioId(ids:readonly string[],active:string|undefined,step:1|-1=1):string|undefined{
 if(ids.length===0)return undefined;
 const i=active===undefined?-1:ids.indexOf(active);
 if(i<0)return step===1?ids[0]:ids[ids.length-1];
 return ids[(i+step+ids.length)%ids.length];
}
