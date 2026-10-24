import type {Layer,Property} from './model';
/**
 * Copies of `picked` prepared for another composition. New ids, parents and matte sources that point at another picked layer follow the copies,
 * a parent or matte outside the picked set is dropped (it stays behind), link modifiers to layers outside the set are removed.
 * The picked order is the stacking order (first is on top). Pure.
 */
export function sendCopies(layers:readonly Layer[],picked:readonly string[],ids:readonly string[]):Layer[]{
 const map=new Map(picked.map((p,i)=>[p,ids[i]] as const));
 const out:Layer[]=[];
 for(const l of layers){
  const id=map.get(l.id);if(id===undefined)continue;
  const c=JSON.parse(JSON.stringify(l)) as Layer;c.id=id;
  c.parent=l.parent!==null&&map.has(l.parent)?map.get(l.parent)!:null;
  if(c.matte){if(map.has(c.matte.source))c.matte={...c.matte,source:map.get(c.matte.source)!};else delete (c as {matte?:unknown}).matte;}
  const tr=c.transform as unknown as Record<string,Property>;
  for(const k of Object.keys(tr)){const ms=tr[k].modifiers;if(!ms)continue;
   const keep=ms.filter(m=>m.type!=='link'||map.has(m.layer)).map(m=>m.type==='link'?{...m,layer:map.get(m.layer)!}:m);
   tr[k]=keep.length?{...tr[k],modifiers:keep}:(({modifiers:_m,...rest})=>rest as Property)(tr[k]);}
  out.push(c);
 }
 return out;
}
