import {parseInterfaceDocument,serializeInterfaceDocument,type InterfaceDocument} from './model';
import {computeInterfaceLayout} from './layout';
import {resolveInterfaceValues,resolvedTextStyle} from './tokens';
export interface DevRect {x:number;y:number;width:number;height:number;}
export interface MeasurementEntry {id:string;name:string;rect:DevRect;toParent?:{left:number;top:number;right:number;bottom:number};}
export interface MeasurementPair {a:string;b:string;aName:string;bName:string;horizontal:number;vertical:number;aRect:DevRect;bRect:DevRect;}
const MAX_MEASURE=8,MAX_PAIRS=16,MAX_ASSETS=32;
function sceneRects(source:InterfaceDocument,_ids?:readonly string[]){const doc=resolveInterfaceValues(parseInterfaceDocument(serializeInterfaceDocument(source))).document,layout=computeInterfaceLayout(doc),map=new Map(doc.nodes.map(n=>[n.id,n]));const rect=(id:string):DevRect|undefined=>{let n=map.get(id),x=0,y=0,b=layout.bounds.get(id);if(!n||!b||n.hidden)return undefined;x=b.x;y=b.y;const w=b.width,h=b.height;let p=n.parentId,depth=0;while(p&&depth++<64){const pn=map.get(p),pb=layout.bounds.get(p);if(!pn||!pb)break;x+=pb.x;y+=pb.y;p=pn.parentId;}return {x,y,width:w,height:h};};return {doc,layout,map,rect};}
/** Dev-mode measurements: scene-space rects, distances to the parent edges, and pairwise gaps between selected layers. Display-only. */
export function interfaceMeasurements(source:InterfaceDocument,ids:readonly string[]):{entries:MeasurementEntry[];pairs:MeasurementPair[]}{
 if(!ids.length||ids.length>MAX_MEASURE)throw Error(`Select 1-${MAX_MEASURE} layers to measure.`);const {layout,map,rect}=sceneRects(source,ids);const entries:MeasurementEntry[]=[];
 for(const id of ids){const r=rect(id),n=map.get(id);if(!r||!n)continue;const b=layout.bounds.get(id)!;const parent=n.parentId?map.get(n.parentId):undefined;const pb=n.parentId?layout.bounds.get(n.parentId):undefined;entries.push({id,name:n.name,rect:r,toParent:parent&&pb?{left:b.x,top:b.y,right:pb.width-(b.x+b.width),bottom:pb.height-(b.y+b.height)}:undefined});}
 const pairs:MeasurementPair[]=[];for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){if(pairs.length>=MAX_PAIRS)break;const a=entries[i].rect,b=entries[j].rect;pairs.push({a:entries[i].id,b:entries[j].id,aName:entries[i].name,bName:entries[j].name,horizontal:Math.max(0,Math.max(a.x-(b.x+b.width),b.x-(a.x+a.width))),vertical:Math.max(0,Math.max(a.y-(b.y+b.height),b.y-(a.y+a.height))),aRect:a,bRect:b});}
 return {entries,pairs};
}
const round=(v:number)=>Math.round(v*100)/100;
/** Tailwind-ish utility list for one layer. Display-only: arbitrary values, not a compiled config. */
export function interfaceLayerTailwind(source:InterfaceDocument,layerId:string):{name:string;snippet:string;warnings:string[]}{
 const {doc,map}=sceneRects(source,[layerId]),n=map.get(layerId);if(!n)throw Error('Select a layer.');const b=computeInterfaceLayout(doc).bounds.get(layerId)!,parent=n.parentId?map.get(n.parentId):undefined,flow=parent?.layout&&parent.layout.direction!=='free'&&!n.sizing?.absolute;const classes:string[]=[flow?'relative':'absolute',`w-[${round(b.width)}px]`,`h-[${round(b.height)}px]`];if(!flow)classes.push(`left-[${round(b.x)}px]`,`top-[${round(b.y)}px]`);
 if(n.hidden)classes.push('hidden');if(['frame','rectangle'].includes(n.kind))classes.push(`bg-[${n.fill}]`);if(n.radius&&['frame','rectangle'].includes(n.kind))classes.push(`rounded-[${n.radius}px]`);if(n.kind==='frame')classes.push('overflow-hidden');
 if(n.layout&&n.layout.direction!=='free'){if(n.layout.direction==='grid')classes.push('grid',`grid-cols-${n.layout.columns??1}`,`gap-[${n.layout.gap}px]`);else classes.push('flex',n.layout.direction==='row'?'flex-row':'flex-col',n.layout.wrap?'flex-wrap':'flex-nowrap',`gap-[${n.layout.gap}px]`,({start:'items-start',center:'items-center',end:'items-end',stretch:'items-stretch',baseline:'items-baseline'} as const)[n.layout.align]);const[pt,pr,pb,pl]=n.layout.padding;classes.push(pt===pr&&pr===pb&&pb===pl?`p-[${pt}px]`:`pt-[${pt}px] pr-[${pr}px] pb-[${pb}px] pl-[${pl}px]`.split(' ').join(' '));}
 if(n.kind==='text'){const t=resolvedTextStyle(doc,n);classes.push(`text-[${t.fontSize}px]`,`leading-[${t.lineHeight}]`,({400:'font-normal',500:'font-medium',600:'font-semibold',700:'font-bold'} as const)[t.fontWeight],`text-[${n.fill}]`,t.fontFamily==='monospace'?'font-mono':t.fontFamily==='serif'?'font-serif':'font-sans','whitespace-pre-wrap');if(t.letterSpacing)classes.push(`tracking-[${t.letterSpacing}px]`);}
 if(n.stroke)classes.push(`outline-[${n.strokeWidth??2}px]`,`outline-[${n.stroke}]`);
 return {name:n.name,snippet:classes.join(' '),warnings:['Display-only Tailwind-ish utilities with arbitrary values; no Tailwind config or production markup is generated.','Vector fills, images, bindings, constraints and prototype behavior are not reproduced.']};
}
const color=(hex:string)=>`Color("${hex.replace('#','').toUpperCase()}")`;
/** SwiftUI-ish single-layer view description. Display-only, never compiled. */
export function interfaceLayerSwiftUI(source:InterfaceDocument,layerId:string):{name:string;snippet:string;warnings:string[]}{
 const {doc,map}=sceneRects(source,[layerId]),n=map.get(layerId);if(!n)throw Error('Select a layer.');const b=computeInterfaceLayout(doc).bounds.get(layerId)!;const literal=(s:string)=>JSON.stringify(s).replaceAll('<','\\u003c').replaceAll('>','\\u003e');let body='';
 if(n.kind==='text'){const t=resolvedTextStyle(doc,n);const weight=({400:'regular',500:'medium',600:'semibold',700:'bold'} as const)[t.fontWeight];body=`Text(${literal(n.text??'')})\n    .font(.system(size: ${t.fontSize}, weight: .${weight}))\n    .foregroundStyle(${color(n.fill)})${t.letterSpacing?`\n    .tracking(${t.letterSpacing})`:''}`;}
 else if(n.kind==='ellipse')body=`Ellipse()\n    .fill(${color(n.fill)})`;else if(n.kind==='line'||n.kind==='path')body=`Path() // vector outline not reproduced\n    .stroke(${color(n.stroke??n.fill)}, lineWidth: ${n.strokeWidth??2})`;else body=`Rectangle()\n    .fill(${color(n.fill)})${n.radius?`\n    .cornerRadius(${n.radius})`:''}`;
 body+=`\n    .frame(width: ${round(b.width)}, height: ${round(b.height)})`;if(n.layout&&n.layout.direction!=='free')body=`${n.layout.direction==='grid'?'LazyVGrid(columns: ...)':'VStack(spacing: '+n.layout.gap+')'} {\n    ${body.split('\n').join('\n    ')}\n} // child layout: ${n.layout.direction}, padding ${n.layout.padding.join(' ')}`;
 return {name:n.name,snippet:body,warnings:['Display-only SwiftUI-ish view description; not compiled or production-ready.','Position is the parent-relative frame; bindings, images, constraints and prototype behavior are not reproduced.']};
}
export interface DevAssetEntry {id:string;name:string;kind:'image'|'vector';width:number;height:number;}
/** Exportable artwork inside a layer subtree: embedded images and vector shapes. */
export function interfaceLayerAssets(source:InterfaceDocument,rootId:string):DevAssetEntry[]{
 const {layout,map}=sceneRects(source,[rootId]);if(!map.get(rootId))throw Error('Select a layer.');const out:DevAssetEntry[]=[];const walk=(id:string)=>{if(out.length>=MAX_ASSETS)return;const n=map.get(id);if(!n||n.hidden)return;const b=layout.bounds.get(id)!;if(n.imageFill)out.push({id,name:n.name,kind:'image',width:b.width,height:b.height});else if(['ellipse','line','path'].includes(n.kind))out.push({id,name:n.name,kind:'vector',width:b.width,height:b.height});n.children.forEach(walk);};walk(rootId);return out;
}
