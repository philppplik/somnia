import type {Layer,Property} from './model';
export const MAX_DUPLICATE_LAYERS=50;
const remap=(id:string,map:ReadonlyMap<string,string>)=>map.get(id)??id;
/**
 * Copies of the layers in `picked`, each placed directly above its original and named "<name> copy".
 * References between duplicated layers (parent, matte source, link modifiers) point at the copies; references to other layers stay.
 * `ids` gives one new id per picked layer, in the order of `picked`. Pure; the caller validates the ids are unused.
 */
export function duplicateLayers(layers:readonly Layer[],picked:readonly string[],ids:readonly string[]):Layer[]{
 if(!picked.length||picked.length>MAX_DUPLICATE_LAYERS||picked.length!==ids.length)throw Object.assign(new Error(`Pick 1 to ${MAX_DUPLICATE_LAYERS} layers.`),{expected:true});
 const map=new Map(picked.map((p,i)=>[p,ids[i]] as const));
 if(map.size!==picked.length||new Set(ids).size!==ids.length)throw new Error('Duplicate layer ids.');
 const out:Layer[]=[];
 for(const l of layers){
  const id=map.get(l.id);
  if(id===undefined){out.push(l);continue;}
  const c=JSON.parse(JSON.stringify(l)) as Layer;
  c.id=id;c.name=`${l.name} copy`.slice(0,200);
  c.parent=l.parent===null?null:remap(l.parent,map);
  if(c.matte)c.matte={...c.matte,source:remap(c.matte.source,map)};
  const tr=c.transform as unknown as Record<string,Property>;
  for(const k of Object.keys(tr)){const ms=tr[k].modifiers;if(ms)tr[k]={...tr[k],modifiers:ms.map(m=>m.type==='link'?{...m,layer:remap(m.layer,map)}:m)};}
  out.push(c,l);
 }
 if(out.length!==layers.length+picked.length)throw Object.assign(new Error('A picked layer no longer exists.'),{expected:true});
 return out;
}
