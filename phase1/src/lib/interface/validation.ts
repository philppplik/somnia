import type {InterfaceDocument} from './schema';
import {validateInterfaceAssets} from './assetsCore';
import {validateInterfaceVectors} from './vectorCore';
import {validateInterfaceTokens} from './tokens';
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const num=(v:unknown,min=0,max=32768)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const id=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const name=(v:unknown)=>typeof v==='string'&&v.trim().length>0&&v.length<=256;
const axes=['start','end','center','stretch','scale'];
export const OVERRIDE_KEYS=['name','text','fill','hidden','width','height'] as const;
export function validOverride(key:string,value:unknown):boolean{
 return key==='name'?name(value):key==='text'?typeof value==='string'&&value.length<=100_000:key==='fill'?typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value):key==='hidden'?typeof value==='boolean':['width','height'].includes(key)&&num(value,1);
}
/** P1 recognized fields fail closed; no evaluator, URL or arbitrary patch keys. */
export function validateInterfaceFeatures(d:InterfaceDocument):void{
 validateInterfaceTokens(d);validateInterfaceAssets(d);validateInterfaceVectors(d);
 const nodes=new Map(d.nodes.map(n=>[n.id,n]));const components=d.components??[];
 if(!Array.isArray(components)||components.length>100)throw Error('Invalid component catalogue.');
 const componentIds=new Set<string>(),variantIds=new Set<string>(),masterIds=new Set<string>();
 for(const c of components){
  if(!obj(c)||!id(c.id)||componentIds.has(c.id)||nodes.has(c.id)||d.pages.some(p=>p.id===c.id)||c.id===d.id||!name(c.name)||!Array.isArray(c.variants)||!c.variants.length||c.variants.length>50)throw Error('Invalid component.');componentIds.add(c.id);
  const names=new Set<string>();
  for(const v of c.variants){const root=nodes.get(v.rootId);if(!obj(v)||!id(v.id)||variantIds.has(v.id)||componentIds.has(v.id)||nodes.has(v.id)||d.pages.some(p=>p.id===v.id)||d.id===v.id||!name(v.name)||names.has(v.name)||!root||root.kind!=='frame'||root.instance||masterIds.has(root.id))throw Error('Invalid component variant.');variantIds.add(v.id);names.add(v.name);masterIds.add(root.id);
   const slots=new Set<string>();const walk=(nid:string)=>{const n=nodes.get(nid)!;if(!id(n.componentSlot)||slots.has(n.componentSlot!))throw Error('Missing or duplicate component slot.');slots.add(n.componentSlot!);n.children.forEach(walk);};walk(root.id);
  }
 }
 if(components.some(c=>variantIds.has(c.id)))throw Error('Duplicate component identity.');
 for(const n of d.nodes){
  if(n.layout!==undefined){const l=n.layout;if(!obj(l)||!['frame','group'].includes(n.kind)||!['free','row','column','grid'].includes(l.direction)||typeof l.wrap!=='boolean'||!num(l.gap)||!Array.isArray(l.padding)||l.padding.length!==4||!l.padding.every(v=>num(v))||!['start','center','end','stretch'].includes(l.align))throw Error('Invalid auto layout.');if(l.columns!==undefined&&(!Number.isInteger(l.columns)||l.columns<1||l.columns>24))throw Error('Invalid grid column count.');}
  if(n.sizing!==undefined){const z=n.sizing;if(!obj(z)||!['fixed','hug','fill'].includes(z.width)||!['fixed','hug','fill'].includes(z.height)||!num(z.minWidth,1)||!num(z.minHeight,1)||!num(z.maxWidth,1)||!num(z.maxHeight,1)||z.minWidth>z.maxWidth||z.minHeight>z.maxHeight||typeof z.absolute!=='boolean')throw Error('Invalid sizing.');}
  if(n.constraints!==undefined){const c=n.constraints;if(!obj(c)||!axes.includes(c.horizontal)||!axes.includes(c.vertical)||!num(c.parentWidth,1)||!num(c.parentHeight,1)||!n.parentId)throw Error('Invalid constraints.');}
  if(n.componentSlot!==undefined&&!id(n.componentSlot))throw Error('Invalid component slot.');
  if(n.instance!==undefined){const i=n.instance,c=components.find(c=>c.id===i.componentId);if(!obj(i)||n.kind!=='frame'||!c||!c.variants.some(v=>v.id===i.variantId)||!Array.isArray(i.overrides)||i.overrides.length>2000)throw Error('Invalid instance reference.');const seen=new Set<string>();for(const o of i.overrides){if(!obj(o)||!id(o.slot)||seen.has(o.slot)||!obj(o.values)||!Object.entries(o.values).every(([k,v])=>validOverride(k,v)))throw Error('Invalid component override.');seen.add(o.slot);}}
 }
 // Masters cannot contain masters or instances referring back to their component (including indirect cycles).
 const deps=new Map<string,Set<string>>();
 for(const c of components){const set=new Set<string>();for(const v of c.variants){const walk=(nid:string)=>{const n=nodes.get(nid)!;if(nid!==v.rootId&&masterIds.has(nid))throw Error('Nested component master.');if(n.instance)set.add(n.instance.componentId);n.children.forEach(walk);};walk(v.rootId);}deps.set(c.id,set);}
 const done=new Set<string>(),active=new Set<string>();const visit=(cid:string,depth:number)=>{if(depth>32||active.has(cid))throw Error('Component reference cycle or expansion depth.');if(done.has(cid))return;active.add(cid);for(const dep of deps.get(cid)??[])visit(dep,depth+1);active.delete(cid);done.add(cid);};for(const c of components)visit(c.id,0);
}
