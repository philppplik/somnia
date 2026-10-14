import {uid,MAX_NODES,type InterfaceDocument,type InterfaceNode} from './model';
import {OVERRIDE_KEYS,validOverride} from './validation';
export interface ComponentDiagnostic {instanceId:string;slot:string;message:string;}
const subtree=(doc:InterfaceDocument,rootId:string):InterfaceNode[]=>{const nodes=new Map(doc.nodes.map(n=>[n.id,n]));const out:InterfaceNode[]=[],seen=new Set<string>();const walk=(id:string,depth:number)=>{const n=nodes.get(id);if(!n||seen.has(id)||depth>64||out.length>=MAX_NODES)throw Error('Missing, cyclic or oversized component tree.');seen.add(id);out.push(n);n.children.forEach(child=>walk(child,depth+1));};walk(rootId,0);return out;};
export function createComponent(doc:InterfaceDocument,rootId:string,name:string):string{
 const root=doc.nodes.find(n=>n.id===rootId);if(!root||root.kind!=='frame'||root.locked||root.instance)throw Error('Select an unlocked frame to create a component.');
 if(doc.components?.some(c=>c.variants.some(v=>v.rootId===rootId)))throw Error('Frame is already a component master.');
 for(const n of subtree(doc,rootId))n.componentSlot??=uid();
 const id=uid();(doc.components??=[]).push({id,name,variants:[{id:uid(),name:'Default',rootId}]});return id;
}
/** Duplicating a variant preserves stable semantic slots; variant labels are never override identities. */
export function addComponentVariant(doc:InterfaceDocument,componentId:string,sourceVariantId:string,name:string):string{
 const c=doc.components?.find(c=>c.id===componentId),v=c?.variants.find(v=>v.id===sourceVariantId);if(!c||!v)throw Error('Component variant unavailable.');
 const source=subtree(doc,v.rootId),map=new Map(source.map(n=>[n.id,uid()]));const root=source[0];
 const copies=source.map(n=>({...structuredClone(n),id:map.get(n.id)!,parentId:n.id===root.id?root.parentId:map.get(n.parentId!)!,children:n.children.map(id=>map.get(id)!)}));
 copies[0].name=name;copies[0].x+=root.width+40;doc.nodes.push(...copies);
 const siblings=root.parentId?doc.nodes.find(n=>n.id===root.parentId)!.children:doc.pages.find(p=>p.id===root.pageId)!.children;siblings.push(copies[0].id);
 const id=uid();const props={...v.props};const first=c.properties?.find(p=>!p.type||p.type==='variant');if(first){let i=c.variants.length+1,value=`Value ${i}`;while(first.values!.includes(value)){value=`Value ${++i}`;}first.values!.push(value);props[first.name]=value;}c.variants.push({id,name,rootId:copies[0].id,...(c.properties?{props}:{})});return id;
}
export function instantiateComponent(doc:InterfaceDocument,componentId:string,variantId:string,pageId:string,parentId:string|null=null):string{
 const c=doc.components?.find(c=>c.id===componentId),v=c?.variants.find(v=>v.id===variantId),master=v&&doc.nodes.find(n=>n.id===v.rootId);const page=doc.pages.find(p=>p.id===pageId),parent=parentId?doc.nodes.find(n=>n.id===parentId):undefined;
 if(!master||!page||parentId&&(!parent||parent.pageId!==pageId||parent.locked||!['frame','group'].includes(parent.kind)))throw Error('Invalid component destination.');
 const root:InterfaceNode={...structuredClone(master),id:uid(),pageId,parentId,children:[],x:master.x+master.width+40,y:master.y,locked:false,instance:{componentId,variantId,overrides:[]}};
 doc.nodes.push(root);(parent?.children??page.children).push(root.id);synchronizeInstances(doc);return root.id;
}
export function owningInstance(doc:InterfaceDocument,id:string):InterfaceNode|undefined{
 let node=doc.nodes.find(n=>n.id===id);for(let i=0;node&&i<=64;i++){if(node.instance)return node;node=node.parentId?doc.nodes.find(n=>n.id===node!.parentId):undefined;}return undefined;
}
export function patchInterfaceNode(doc:InterfaceDocument,id:string,patch:Partial<InterfaceNode>):void{
 const node=doc.nodes.find(n=>n.id===id);if(!node||node.locked&&Object.keys(patch).some(k=>k!=='locked'))throw Error('Layer is locked or unavailable.');
 const instance=owningInstance(doc,id);
 if(instance){const keys=Object.keys(patch);const rootGeometry=id===instance.id&&keys.every(k=>['x','y','constraints','locked','annotation','ready','variableMode'].includes(k));
  if(!rootGeometry){if(!node.componentSlot||!keys.every(k=>validOverride(k,patch[k])))throw Error('Detach the instance before structural or layout edits.');
   let override=instance.instance!.overrides.find(o=>o.slot===node.componentSlot);if(!override){override={slot:node.componentSlot,values:{}};instance.instance!.overrides.push(override);}Object.assign(override.values,patch);
  }
 }
 Object.assign(node,patch);if(patch.fill!==undefined&&node.bindings){node.bindings={...node.bindings};delete node.bindings.fill;}
}
export function switchInstanceVariant(doc:InterfaceDocument,id:string,variantId:string):void{
 const root=doc.nodes.find(n=>n.id===id),c=doc.components?.find(c=>c.id===root?.instance?.componentId);if(!root?.instance||root.locked||!c?.variants.some(v=>v.id===variantId))throw Error('Variant unavailable.');root.instance.variantId=variantId;
}
/** Swap keeps root position and matching slot overrides; absent slots stay preserved as visible orphan warnings, never applied to another layer. Variant choice prefers matching property values. */
export function swapInstanceComponent(doc:InterfaceDocument,id:string,componentId:string):void{
 const root=doc.nodes.find(n=>n.id===id),target=doc.components?.find(c=>c.id===componentId);
 if(!root?.instance||root.locked||!target||target.id===root.instance.componentId)throw Error('Component swap unavailable.');
 const current=doc.components?.find(c=>c.id===root.instance!.componentId),currentProps=current?.variants.find(v=>v.id===root.instance!.variantId)?.props;
 let variant=target.variants[0];
 if(currentProps&&target.properties?.length){const match=target.variants.find(v=>target.properties!.every(p=>currentProps[p.name]===undefined||v.props?.[p.name]===currentProps[p.name]));if(match)variant=match;}
 root.instance={componentId:target.id,variantId:variant.id,overrides:root.instance.overrides};
}
export function resetInstanceOverrides(doc:InterfaceDocument,id:string):void{const root=doc.nodes.find(n=>n.id===id);if(!root?.instance||root.locked)throw Error('Instance unavailable.');root.instance.overrides=[];delete root.instance.propertyValues;}
export function detachInstance(doc:InterfaceDocument,id:string):void{const root=doc.nodes.find(n=>n.id===id);if(!root?.instance||root.locked)throw Error('Instance unavailable.');delete root.instance;for(const n of subtree(doc,id))if(!owningInstance(doc,n.id))delete n.componentSlot;}
/** Called once per content transaction. Derived instance changes and master edit share its undo entry. */
export function synchronizeInstances(doc:InterfaceDocument):ComponentDiagnostic[]{
 const diagnostics:ComponentDiagnostic[]=[];const processed=new Set<string>();let expanded=0;
 const sync=(root:InterfaceNode,depth:number,active:Set<string>)=>{
  if(!root.instance||processed.has(root.id))return;if(depth>32||active.has(root.instance.componentId))throw Error('Component expansion cycle.');
  const instance=root.instance,c=doc.components?.find(c=>c.id===instance.componentId),variant=c?.variants.find(v=>v.id===instance.variantId);if(!variant)throw Error('Missing component variant.');
  const source=subtree(doc,variant.rootId),old=subtree(doc,root.id);const existing=new Map(old.filter(n=>n.componentSlot).map(n=>[n.componentSlot!,n]));const sourceSlots=new Set(source.map(n=>n.componentSlot!));
  for(const o of instance.overrides)if(!sourceSlots.has(o.slot))diagnostics.push({instanceId:root.id,slot:o.slot,message:'Override target is absent from this variant; override is preserved.'});
  const ids=new Map(source.map((n,index)=>[n.id,index===0?root.id:existing.get(n.componentSlot!)?.id??uid()]));const overrides=new Map(instance.overrides.map(o=>[o.slot,o.values]));
  const generated=source.map((n,index)=>{
   if(++expanded>MAX_NODES*2)throw Error('Component expansion budget exceeded.');
   const copy:InterfaceNode={...structuredClone(n),id:ids.get(n.id)!,pageId:root.pageId,parentId:index===0?root.parentId:ids.get(n.parentId!)!,children:n.children.map(id=>ids.get(id)!)};
   if(index===0){copy.x=root.x;copy.y=root.y;copy.locked=root.locked;copy.instance=instance;copy.constraints=root.constraints;copy.annotation=root.annotation??copy.annotation;copy.ready=root.ready??copy.ready;copy.variableMode=root.variableMode;}
   for(const [key,value] of Object.entries(overrides.get(n.componentSlot!)??{})){if(!OVERRIDE_KEYS.includes(key as typeof OVERRIDE_KEYS[number]))throw Error('Unknown override.');copy[key]=value;if(key==='fill'&&copy.bindings){copy.bindings={...copy.bindings};delete copy.bindings.fill;}}
   return copy;
  });
  const pv=instance.propertyValues;
  if(pv)for(const p of c?.properties??[]){if(!p.type||p.type==='variant')continue;const value=pv[p.name];if(value===undefined)continue;const target=generated.find(n=>n.componentSlot===p.slot);if(!target){diagnostics.push({instanceId:root.id,slot:p.slot!,message:'Property target is absent from this variant; value is preserved.'});continue;}
   if(p.type==='text'&&target.kind==='text'&&typeof value==='string'){target.text=value;}
   else if(p.type==='boolean'&&typeof value==='boolean')target.hidden=value;
   else if(p.type==='swap'&&typeof value==='string'&&target.instance){const tc=doc.components?.find(x=>x.id===value);if(tc)target.instance={componentId:tc.id,variantId:tc.variants[0].id,overrides:target.instance.overrides};}
  }
  const removing=new Set(old.map(n=>n.id));doc.nodes=doc.nodes.filter(n=>!removing.has(n.id));doc.nodes.push(...generated);if(doc.nodes.length>MAX_NODES)throw Error('Component node limit exceeded.');processed.add(root.id);
  const nextActive=new Set(active);nextActive.add(instance.componentId);for(const child of generated.slice(1))if(child.instance)sync(child,depth+1,nextActive);
 };
 // Highest instance owns its subtree. Nested instances are synchronized through its source.
 const roots=doc.nodes.filter(n=>n.instance&&!doc.nodes.some(p=>p.instance&&p.id!==n.id&&subtree(doc,p.id).some(child=>child.id===n.id)));
 const ranks=new Map<string,number>();const rank=(cid:string,active=new Set<string>()):number=>{if(active.size>32||active.has(cid))throw Error('Component cycle or depth.');const cached=ranks.get(cid);if(cached!==undefined)return cached;const next=new Set(active);next.add(cid);const c=doc.components?.find(c=>c.id===cid);const deps=(c?.variants??[]).flatMap(v=>subtree(doc,v.rootId).filter(n=>n.instance).map(n=>n.instance!.componentId));const result=deps.length?1+Math.max(...deps.map(id=>rank(id,next))):0;ranks.set(cid,result);return result;};
 for(const root of roots.sort((a,b)=>rank(a.instance!.componentId)-rank(b.instance!.componentId)))sync(root,0,new Set());return diagnostics;
}
export function componentDiagnostics(doc:InterfaceDocument):ComponentDiagnostic[]{
 const out:ComponentDiagnostic[]=[];for(const root of doc.nodes.filter(n=>n.instance)){const c=doc.components?.find(c=>c.id===root.instance!.componentId),v=c?.variants.find(v=>v.id===root.instance!.variantId);if(!v)continue;const slots=new Set(subtree(doc,v.rootId).map(n=>n.componentSlot));for(const o of root.instance!.overrides)if(!slots.has(o.slot))out.push({instanceId:root.id,slot:o.slot,message:'Override target is absent from this variant; override is preserved.'});}return out;
}

/** New master descendants acquire semantic slots inside the same transaction. */
export function assignMasterSlots(doc:InterfaceDocument):void{for(const c of doc.components??[])for(const v of c.variants)for(const n of subtree(doc,v.rootId))n.componentSlot??=uid();}
