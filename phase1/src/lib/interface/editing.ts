import {DEFAULT_SNAP,validateSnap,type SnapSettings} from './snapCore';
export {DEFAULT_SNAP,validateSnap,type SnapSettings} from './snapCore';
import {insideInstance,deleteNode,uid,type InterfaceDocument,type InterfaceNode} from './model';
import {DEFAULT_INTERFACE_STROKE} from './schema';
import {computeInterfaceLayout,type LayoutBounds} from './layout';
import {patchInterfaceNode} from './components';
export type AlignMode='left'|'centerX'|'right'|'top'|'centerY'|'bottom';
export function selectionRoots(doc:InterfaceDocument,ids:readonly string[]):InterfaceNode[]{const selected=new Set(ids);return doc.nodes.filter(n=>selected.has(n.id)&&!ancestorSelected(n));function ancestorSelected(n:InterfaceNode):boolean{let id=n.parentId;for(let depth=0;id&&depth<64;depth++){if(selected.has(id))return true;id=doc.nodes.find(n=>n.id===id)?.parentId??null;}return false;}}
export function movableSelection(doc:InterfaceDocument,ids:readonly string[]):InterfaceNode[]{
 const nodes=selectionRoots(doc,ids);if(!nodes.length)throw Error('Select layers first.');const parent=nodes[0].parentId,page=nodes[0].pageId;
 for(const n of nodes){const container=doc.nodes.find(p=>p.id===n.parentId);if(n.locked||n.pageId!==page||n.parentId!==parent||n.parentId&&insideInstance(doc,n.parentId)||container?.layout&&container.layout.direction!=='free'&&!n.sizing?.absolute)throw Error('Select unlocked free-layout siblings, or use stack reorder.');}return nodes;
}
export function translateSelection(doc:InterfaceDocument,ids:readonly string[],dx:number,dy:number){const nodes=movableSelection(doc,ids);const layout=computeInterfaceLayout(doc);for(const n of nodes){const b=layout.bounds.get(n.id)!;patchInterfaceNode(doc,n.id,{x:b.x+dx,y:b.y+dy,constraints:undefined});}}
export function alignSelection(doc:InterfaceDocument,ids:readonly string[],mode:AlignMode){const nodes=movableSelection(doc,ids);if(nodes.length<2)throw Error('Select at least two layers.');const layout=computeInterfaceLayout(doc),bounds=nodes.map(n=>layout.bounds.get(n.id)!);const left=Math.min(...bounds.map(b=>b.x)),right=Math.max(...bounds.map(b=>b.x+b.width)),top=Math.min(...bounds.map(b=>b.y)),bottom=Math.max(...bounds.map(b=>b.y+b.height));for(const n of nodes){const b=layout.bounds.get(n.id)!;const x=mode==='left'?left:mode==='right'?right-b.width:mode==='centerX'?(left+right-b.width)/2:b.x,y=mode==='top'?top:mode==='bottom'?bottom-b.height:mode==='centerY'?(top+bottom-b.height)/2:b.y;patchInterfaceNode(doc,n.id,{x,y,constraints:undefined});}}
export function distributeSelection(doc:InterfaceDocument,ids:readonly string[],axis:'x'|'y'){const nodes=movableSelection(doc,ids);if(nodes.length<3)throw Error('Select at least three layers.');const layout=computeInterfaceLayout(doc),size=axis==='x'?'width':'height';nodes.sort((a,b)=>layout.bounds.get(a.id)![axis]-layout.bounds.get(b.id)![axis]);const first=layout.bounds.get(nodes[0].id)!,last=layout.bounds.get(nodes.at(-1)!.id)!;const occupied=nodes.reduce((sum,n)=>sum+layout.bounds.get(n.id)![size],0),gap=(last[axis]+last[size]-first[axis]-occupied)/(nodes.length-1);let pos=first[axis];for(const n of nodes){patchInterfaceNode(doc,n.id,{[axis]:pos,constraints:undefined});pos+=layout.bounds.get(n.id)![size]+gap;}}
/** Wraps the selected siblings in a new group node; children keep their sibling order and become relative to the group origin. */
export function groupInterfaceSelection(doc:InterfaceDocument,ids:readonly string[]):string{
 const nodes=movableSelection(doc,ids),first=nodes[0],parentId=first.parentId,pageId=first.pageId;
 const computed=computeInterfaceLayout(doc);
 const minX=Math.min(...nodes.map(n=>computed.bounds.get(n.id)!.x)),minY=Math.min(...nodes.map(n=>computed.bounds.get(n.id)!.y));
 const maxX=Math.max(...nodes.map(n=>computed.bounds.get(n.id)!.x+computed.bounds.get(n.id)!.width)),maxY=Math.max(...nodes.map(n=>computed.bounds.get(n.id)!.y+computed.bounds.get(n.id)!.height));
 const parentNode=parentId?doc.nodes.find(n=>n.id===parentId)!:null;
 const siblings=parentNode?parentNode.children:doc.pages.find(p=>p.id===pageId)!.children;
 const selected=new Set(nodes.map(n=>n.id)),index=siblings.findIndex(id=>selected.has(id));
 const id=uid();
 const group:InterfaceNode={id,pageId,parentId,children:siblings.filter(c=>selected.has(c)),kind:'group',name:'Group',x:minX,y:minY,width:Math.max(1,Math.round(maxX-minX)),height:Math.max(1,Math.round(maxY-minY)),fill:'#000000',hidden:false,locked:false};
 doc.nodes.push(group);
 const next=siblings.filter(c=>!selected.has(c));next.splice(index<0?next.length:index,0,id);
 if(parentNode)parentNode.children=next;else doc.pages.find(p=>p.id===pageId)!.children=next;
 for(const n of nodes){const b=computed.bounds.get(n.id)!;n.parentId=id;patchInterfaceNode(doc,n.id,{x:b.x-minX,y:b.y-minY,constraints:undefined});}
 const moved=new Set(nodes.map(n=>n.id));
 if(doc.prototypeStartFrameId&&moved.has(doc.prototypeStartFrameId))delete doc.prototypeStartFrameId;
 for(const node of doc.nodes)if(node.prototypeLinks)node.prototypeLinks=node.prototypeLinks.filter(l=>{if(moved.has(l.targetFrameId))return false;if(l.elseTargetFrameId&&moved.has(l.elseTargetFrameId))delete l.elseTargetFrameId;return true;});
 return id;
}
/** Dissolves each selected group in place; children regain absolute positions at the group's former slot. */
export function ungroupInterfaceSelection(doc:InterfaceDocument,ids:readonly string[]):string[]{
 const freed:string[]=[];
 for(const id of ids){const n=doc.nodes.find(n=>n.id===id);if(!n)continue;if(n.kind!=='group')throw Error('Select a group to ungroup.');if(n.locked)throw Error('Group is locked.');if(n.parentId&&insideInstance(doc,n.parentId))throw Error('Instance structure cannot be ungrouped.');
  const parentNode=n.parentId?doc.nodes.find(p=>p.id===n.parentId)!:null;
  const siblings=parentNode?parentNode.children:doc.pages.find(p=>p.id===n.pageId)!.children;
  const index=siblings.indexOf(id),kids=[...n.children];
  siblings.splice(index,1,...kids);
  for(const c of kids){const child=doc.nodes.find(x=>x.id===c)!;child.parentId=n.parentId;patchInterfaceNode(doc,c,{x:child.x+n.x,y:child.y+n.y});}
  doc.nodes.splice(doc.nodes.indexOf(n),1);freed.push(...kids);}
 return freed;
}
export function setInterfaceStroke(doc:InterfaceDocument,id:string,enabled:boolean,color?:string,width?:number){
 const n=doc.nodes.find(n=>n.id===id);if(!n)throw Error('Layer unavailable.');
 if(!['frame','group','rectangle','ellipse','line','path','image'].includes(n.kind))throw Error('Strokes apply to shapes, images and frames.');
 if(!enabled){patchInterfaceNode(doc,id,{stroke:undefined,strokeWidth:undefined});return;}
 const w=width===undefined?(n.strokeWidth??2):Math.round(width);if(!Number.isFinite(w)||w<1||w>64)throw Error('Stroke width must be 1..64 px.');
 const c=(color??n.stroke??DEFAULT_INTERFACE_STROKE).trim();if(!/^#[\da-fA-F]{6}$/.test(c))throw Error('Stroke color must be a hex color like #2255cc.');
 patchInterfaceNode(doc,id,{stroke:c,strokeWidth:w});
}

export function interfaceMarqueeSelect(doc:InterfaceDocument,pageId:string,rect:{x:number;y:number;width:number;height:number}):string[]{
 const page=doc.pages.find(p=>p.id===pageId);if(!page)throw Error('Page unavailable.');
 const x=Math.min(rect.x,rect.x+rect.width),y=Math.min(rect.y,rect.y+rect.height),x2=Math.max(rect.x,rect.x+rect.width),y2=Math.max(rect.y,rect.y+rect.height);
 const computed=computeInterfaceLayout(doc);
 return page.children.filter(id=>{const n=doc.nodes.find(n=>n.id===id);if(!n||n.hidden||n.locked)return false;const b=computed.bounds.get(id)!;return b.x<x2&&b.x+b.width>x&&b.y<y2&&b.y+b.height>y;});
}

export function interfaceMarqueeStyle(m:{x0:number;y0:number;x1:number;y1:number}):Record<string,string|number>{
 return {left:Math.min(m.x0,m.x1),top:Math.min(m.y0,m.y1),width:Math.abs(m.x1-m.x0),height:Math.abs(m.y1-m.y0),border:'1px dashed var(--accent)',background:'color-mix(in srgb,var(--accent) 12%,transparent)'};
}

export function deleteSelection(doc:InterfaceDocument,ids:readonly string[]){const nodes=selectionRoots(doc,ids);if(nodes.some(n=>n.locked||n.parentId&&insideInstance(doc,n.parentId)))throw Error('Selection contains protected layers.');for(const n of nodes)deleteNode(doc,n.id);}
/** In-memory owner-scoped clipboard, never reads/writes the OS clipboard or imports arbitrary content. */
export interface InterfaceClipboard {documentId:string;roots:string[];nodes:InterfaceNode[];bounds:Record<string,LayoutBounds>;}
export function copySelection(doc:InterfaceDocument,ids:readonly string[]):InterfaceClipboard{
 const roots=selectionRoots(doc,ids);if(!roots.length)throw Error('Select layers to copy.');const map=new Map(doc.nodes.map(n=>[n.id,n])),nodes:InterfaceNode[]=[];const walk=(id:string)=>{const n=map.get(id)!;nodes.push(structuredClone(n));n.children.forEach(walk);};roots.forEach(n=>walk(n.id));const computed=computeInterfaceLayout(doc);return {documentId:doc.id,roots:roots.map(n=>n.id),nodes,bounds:Object.fromEntries(nodes.map(n=>[n.id,computed.bounds.get(n.id)!]))};
}
export function pasteSelection(doc:InterfaceDocument,clipboard:InterfaceClipboard,pageId:string,parentId:string|null,offset=16):string[]{
 if(doc.id!==clipboard.documentId)throw Error('Clipboard belongs to another document; cross-document resources need a reviewed import.');const page=doc.pages.find(p=>p.id===pageId),parent=doc.nodes.find(n=>n.id===parentId);if(!page||parentId&&(!parent||parent.pageId!==pageId||parent.locked||!['frame','group'].includes(parent.kind)||insideInstance(doc,parent.id)))throw Error('Paste destination unavailable.');
 const map=new Map(clipboard.nodes.map(n=>[n.id,uid()])),roots=new Set(clipboard.roots),copies=clipboard.nodes.map(n=>{const copy={...structuredClone(n),id:map.get(n.id)!,pageId,parentId:roots.has(n.id)?parentId:map.get(n.parentId!)!,children:n.children.map(id=>map.get(id)!)};if(roots.has(n.id)){const b=clipboard.bounds[n.id];copy.x=b.x+offset;copy.y=b.y+offset;delete copy.constraints;}return copy;});
 // Copying masters creates ordinary artwork; copying instances preserves their local component references.
 const sourceNodes=new Map(clipboard.nodes.map(n=>[n.id,n]));const instanceSlots=new Set<string>();const preserve=(id:string)=>{instanceSlots.add(id);sourceNodes.get(id)!.children.forEach(preserve);};clipboard.nodes.filter(n=>n.instance).forEach(n=>preserve(n.id));for(const source of clipboard.nodes)if(!instanceSlots.has(source.id))delete copies.find(n=>n.id===map.get(source.id))!.componentSlot;
 for(const copy of copies)if(copy.prototypeLinks)copy.prototypeLinks=copy.prototypeLinks.map(l=>({...l,targetFrameId:parentId===null&&map.has(l.targetFrameId)?map.get(l.targetFrameId)!:l.targetFrameId}));doc.nodes.push(...copies);const ids=clipboard.roots.map(id=>map.get(id)!);(parent?.children??page.children).push(...ids);return ids;
}
export function snapPosition(x:number,y:number,bounds:LayoutBounds,settings:SnapSettings,tolerance=6):{x:number;y:number;guideX?:number;guideY?:number}{
 if(!settings.enabled)return {x,y};const solve=(value:number,size:number,guides:number[])=>{let result=Math.round(value/settings.grid)*settings.grid,guide:number|undefined;let distance=tolerance;for(const line of guides)for(const edge of [0,size/2,size]){const candidate=line-edge,d=Math.abs(candidate-value);if(d<distance){distance=d;result=candidate;guide=line;}}return {value:result,guide};};const sx=solve(x,bounds.width,settings.guidesX),sy=solve(y,bounds.height,settings.guidesY);return {x:sx.value,y:sy.value,guideX:sx.guide,guideY:sy.guide};
}
/** Only visible siblings in the same parent space; selected roots never snap to themselves. */
export function smartGuideSettings(doc:InterfaceDocument,id:string,selected:readonly string[],settings:SnapSettings):SnapSettings{if(!settings.enabled||settings.smart===false)return settings;const n=doc.nodes.find(n=>n.id===id);if(!n)return settings;const layout=computeInterfaceLayout(doc),exclude=new Set(selectionRoots(doc,selected).map(n=>n.id)),xs=[...settings.guidesX],ys=[...settings.guidesY];for(const sibling of doc.nodes){if(sibling.parentId!==n.parentId||sibling.pageId!==n.pageId||sibling.hidden||exclude.has(sibling.id))continue;const b=layout.bounds.get(sibling.id)!;xs.push(b.x,b.x+b.width/2,b.x+b.width);ys.push(b.y,b.y+b.height/2,b.y+b.height);}return {...settings,guidesX:xs,guidesY:ys};}
export function rulerTicks(length:number,zoom:number){const step=zoom<.5?200:zoom<1?100:50;return Array.from({length:Math.min(200,Math.ceil(length/step)+1)},(_,i)=>i*step);}
