import {validateInterfacePrototype} from './prototypeCore';
import {validateVariantProperties} from './variantProperties';
import type {InterfaceDocument,InterfaceNode} from './schema';
import {validateInterfaceAssets} from './assetsCore';
import {validateInterfaceVectors} from './vectorCore';
import {validateInterfaceTokens} from './tokens';import {validateExportSettings} from './exportSettingsCore';
import {validateInterfaceComments} from './commentsCore';
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
 validateInterfacePrototype(d);validateInterfaceTokens(d);validateExportSettings(d);validateInterfaceAssets(d);validateInterfaceVectors(d);validateInterfaceComments(d);
 const nodes=new Map(d.nodes.map(n=>[n.id,n]));const components=d.components??[];
 if(!Array.isArray(components)||components.length>100)throw Error('Invalid component catalogue.');
 const componentIds=new Set<string>(),variantIds=new Set<string>(),masterIds=new Set<string>();
 for(const c of components){
  if(!obj(c)||!id(c.id)||componentIds.has(c.id)||nodes.has(c.id)||d.pages.some(p=>p.id===c.id)||c.id===d.id||!name(c.name)||!Array.isArray(c.variants)||!c.variants.length||c.variants.length>50)throw Error('Invalid component.');componentIds.add(c.id);
  validateVariantProperties(c);const names=new Set<string>();
  for(const v of c.variants){const root=nodes.get(v.rootId);if(!obj(v)||!id(v.id)||variantIds.has(v.id)||componentIds.has(v.id)||nodes.has(v.id)||d.pages.some(p=>p.id===v.id)||d.id===v.id||!name(v.name)||names.has(v.name)||!root||root.kind!=='frame'||root.instance||masterIds.has(root.id))throw Error('Invalid component variant.');variantIds.add(v.id);names.add(v.name);masterIds.add(root.id);
   const slots=new Map<string,InterfaceNode>();const walk=(nid:string)=>{const n=nodes.get(nid)!;if(!id(n.componentSlot)||slots.has(n.componentSlot!))throw Error('Missing or duplicate component slot.');slots.set(n.componentSlot!,n);n.children.forEach(walk);};walk(root.id);
   for(const p of c.properties??[]){if(!p.type||p.type==='variant')continue;const target=slots.get(p.slot!);if(!target||(p.type==='text'&&target.kind!=='text')||(p.type==='swap'&&!target.instance))throw Error('Typed property target is missing or incompatible in a variant.');}
  }
 }
 if(components.some(c=>variantIds.has(c.id)))throw Error('Duplicate component identity.');
 for(const n of d.nodes){
  if(n.annotation!==undefined&&(typeof n.annotation!=='string'||n.annotation.length>10000||n.annotation.includes('\0')))throw Error('Invalid annotation.');if(n.radius!==undefined&&(!num(n.radius)||n.radius<=0||n.radius>4096||!['frame','rectangle'].includes(n.kind)))throw Error('Invalid corner radius.');if(n.opacity!==undefined&&(!num(n.opacity)||n.opacity<0||n.opacity>=1))throw Error('Invalid layer opacity.');if(n.rotation!==undefined&&(!num(n.rotation,-360,360)||n.rotation===0))throw Error('Invalid layer rotation.');if(n.blendMode!==undefined&&!['multiply','screen','overlay','darken','lighten'].includes(String(n.blendMode)))throw Error('Invalid blend mode.');if(n.textAlign!==undefined&&(n.kind!=='text'||!['left','center','right'].includes(String(n.textAlign))))throw Error('Invalid text alignment.');if(n.textDecoration!==undefined&&(n.kind!=='text'||!['underline','line-through'].includes(String(n.textDecoration))))throw Error('Invalid text decoration.');
  if(n.altText!==undefined&&(typeof n.altText!=='string'||n.altText.length>4000||n.altText.includes('\0')||!n.imageFill))throw Error('Invalid image alt text.');
  if(n.layout!==undefined){const l=n.layout;if(!obj(l)||!['frame','group'].includes(n.kind)||!['free','row','column','grid'].includes(l.direction)||typeof l.wrap!=='boolean'||!num(l.gap)||!Array.isArray(l.padding)||l.padding.length!==4||!l.padding.every(v=>num(v))||!['start','center','end','stretch','baseline'].includes(l.align))throw Error('Invalid auto layout.');if(l.columns!==undefined&&(!Number.isInteger(l.columns)||l.columns<1||l.columns>24))throw Error('Invalid grid column count.');if(l.rows!==undefined&&(!Number.isInteger(l.rows)||l.rows<1||l.rows>24))throw Error('Invalid grid row count.');if(l.justify!==undefined&&!['start','center','end','space-between'].includes(l.justify))throw Error('Invalid main-axis distribution.');if(l.crossGap!==undefined&&!num(l.crossGap))throw Error('Invalid cross-axis gap.');}
  if(n.sizing!==undefined){const z=n.sizing;if(!obj(z)||!['fixed','hug','fill'].includes(z.width)||!['fixed','hug','fill'].includes(z.height)||!num(z.minWidth,1)||!num(z.minHeight,1)||!num(z.maxWidth,1)||!num(z.maxHeight,1)||z.minWidth>z.maxWidth||z.minHeight>z.maxHeight||typeof z.absolute!=='boolean')throw Error('Invalid sizing.');}if(n.span!==undefined&&(!Number.isInteger(n.span)||n.span<1||n.span>24))throw Error('Invalid grid span.');if(n.aspectRatio!==undefined&&(!num(n.aspectRatio)||n.aspectRatio<=0||n.aspectRatio>1000))throw Error('Invalid aspect ratio.');if(n.scroll!==undefined&&(typeof n.scroll!=='boolean'||n.kind!=='frame'))throw Error('Invalid preview scroll flag.');if(n.sticky!==undefined&&typeof n.sticky!=='boolean')throw Error('Invalid sticky flag.');
  if(n.constraints!==undefined){const c=n.constraints;if(!obj(c)||!axes.includes(c.horizontal)||!axes.includes(c.vertical)||!num(c.parentWidth,1)||!num(c.parentHeight,1)||!n.parentId)throw Error('Invalid constraints.');}
  if(n.componentSlot!==undefined&&!id(n.componentSlot))throw Error('Invalid component slot.');
  if(n.instance!==undefined){const i=n.instance,c=components.find(c=>c.id===i.componentId);if(!obj(i)||n.kind!=='frame'||!c||!c.variants.some(v=>v.id===i.variantId)||!Array.isArray(i.overrides)||i.overrides.length>2000)throw Error('Invalid instance reference.');const seen=new Set<string>();for(const o of i.overrides){if(!obj(o)||!id(o.slot)||seen.has(o.slot)||!obj(o.values)||!Object.entries(o.values).every(([k,v])=>validOverride(k,v)))throw Error('Invalid component override.');seen.add(o.slot);}
  if(i.propertyValues!==undefined){if(!obj(i.propertyValues))throw Error('Invalid component property value.');for(const [key,value] of Object.entries(i.propertyValues)){const p=c.properties?.find(p=>p.name===key&&p.type&&p.type!=='variant');if(!p||(p.type==='boolean'&&typeof value!=='boolean')||(p.type==='text'&&(typeof value!=='string'||value.length>100_000))||(p.type==='swap'&&(typeof value!=='string'||!components.some(x=>x.id===value))))throw Error('Invalid component property value.');}}}
 }
 // Masters cannot contain masters or instances referring back to their component (including indirect cycles).
 const deps=new Map<string,Set<string>>();
 for(const c of components){const set=new Set<string>();for(const v of c.variants){const walk=(nid:string)=>{const n=nodes.get(nid)!;if(nid!==v.rootId&&masterIds.has(nid))throw Error('Nested component master.');if(n.instance)set.add(n.instance.componentId);n.children.forEach(walk);};walk(v.rootId);}deps.set(c.id,set);}
 const done=new Set<string>(),active=new Set<string>();const visit=(cid:string,depth:number)=>{if(depth>32||active.has(cid))throw Error('Component reference cycle or expansion depth.');if(done.has(cid))return;active.add(cid);for(const dep of deps.get(cid)??[])visit(dep,depth+1);active.delete(cid);done.add(cid);};for(const c of components)visit(c.id,0);
}
