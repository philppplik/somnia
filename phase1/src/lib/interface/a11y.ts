import {parseInterfaceDocument,serializeInterfaceDocument,type InterfaceDocument} from './model';
import {computeInterfaceLayout} from './layout';
import {resolveInterfaceValues,resolvedTextStyle,resolveVariable,nodeVariableMode} from './tokens';
export interface A11ySuggestion {name:string;value:string;ratio:string;}
export interface A11yFinding {id:string;layerId:string;kind:'contrast'|'tap-target'|'alt-text'|'label'|'overflow'|'text-overflow';name:string;params:Record<string,string>;suggestions?:A11ySuggestion[];}
export interface A11yAudit {findings:A11yFinding[];checked:{text:number;interactive:number;images:number};skipped:number;}
const luminance=(hex:string)=>{const c=[1,3,5].map(i=>{const v=parseInt(hex.slice(i,i+2),16)/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};
export const contrastRatio=(a:string,b:string)=>{const [l1,l2]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (l1+0.05)/(l2+0.05);};
const MAX_FINDINGS=200,TARGET=44;
/** Display-only WCAG review on a frozen resolved copy. No source, history or recovery writes. */
export function auditInterfaceDocument(source:InterfaceDocument):A11yAudit{
 const doc=resolveInterfaceValues(parseInterfaceDocument(serializeInterfaceDocument(source))).document,layout=computeInterfaceLayout(doc),map=new Map(doc.nodes.map(n=>[n.id,n])),findings:A11yFinding[]=[],checked={text:0,interactive:0,images:0};let skipped=0;
 const background=(n:(typeof doc.nodes)[number])=>{let p=n.parentId?map.get(n.parentId):undefined;while(p){if(p.imageFill)return undefined;if(p.kind==='frame'&&/^#[0-9a-fA-F]{6}$/.test(p.fill))return p.fill;p=p.parentId?map.get(p.parentId):undefined;}return '#ffffff';};
 for(const n of doc.nodes){
  if(n.hidden)continue;const b=layout.bounds.get(n.id);if(!b)continue;const capped=findings.length>=MAX_FINDINGS;
  if(n.kind==='text'&&(n.text??'').trim()){checked.text++;
   if(!capped){const style=resolvedTextStyle(doc,n),lines=(n.text??'').split('\n');if(!(n.maxLines!==undefined&&lines.length>n.maxLines)){const line=style.fontSize*style.lineHeight,gap=style.paragraphSpacing??0,height=lines.length*line+Math.max(0,lines.length-1)*gap,over=height-b.height;if(over>.5)findings.push({id:`text-overflow-${n.id}`,layerId:n.id,kind:'text-overflow',name:n.name,params:{name:n.name,overflow:String(Math.round(over))}});}}
   const bg=background(n);
   if(!bg||!/^#[0-9a-fA-F]{6}$/.test(n.fill)){skipped++;continue;}
   const style=resolvedTextStyle(doc,n),large=style.fontSize>=24||(style.fontSize>=18.66&&style.fontWeight>=700),threshold=large?3:4.5,ratio=contrastRatio(n.fill,bg);
   if(ratio<threshold){const mode=nodeVariableMode(doc,n),suggestions=(doc.variables??[]).filter(v=>v.type==='color').map(v=>{const r=resolveVariable(doc,v.id,'color',mode);return r.value!==undefined&&typeof r.value==='string'?{name:v.name,value:String(r.value),ratio:contrastRatio(String(r.value),bg)}:undefined;}).filter((s):s is {name:string;value:string;ratio:number}=>!!s&&s.value.toLowerCase()!==n.fill.toLowerCase()&&s.ratio>=threshold).sort((a,b2)=>b2.ratio-a.ratio).slice(0,3).map(s=>({name:s.name,value:s.value,ratio:s.ratio.toFixed(2)}));
    if(!capped)findings.push({id:`contrast-${n.id}`,layerId:n.id,kind:'contrast',name:n.name,params:{name:n.name,ratio:ratio.toFixed(2),threshold:String(threshold),aaa:String(large?4.5:7)},suggestions});}}
  if(n.prototypeLinks?.length){checked.interactive++;if(!capped&&(b.width<TARGET||b.height<TARGET))findings.push({id:`tap-${n.id}`,layerId:n.id,kind:'tap-target',name:n.name,params:{name:n.name,width:String(Math.round(b.width)),height:String(Math.round(b.height))}});
   let labeled=(n.altText??'').trim().length>0||(n.kind==='text'&&(n.text??'').trim().length>0);const walkLabel=(id:string,depth:number)=>{if(labeled||depth>64)return;const c=map.get(id);if(!c)return;if(!c.hidden&&c.kind==='text'&&(c.text??'').trim()){labeled=true;return;}c.children.forEach(child=>walkLabel(child,depth+1));};n.children.forEach(child=>walkLabel(child,1));
   if(!capped&&!labeled)findings.push({id:`label-${n.id}`,layerId:n.id,kind:'label',name:n.name,params:{name:n.name}});}
  if(n.imageFill){checked.images++;if(!capped&&!(n.altText??'').trim())findings.push({id:`alt-${n.id}`,layerId:n.id,kind:'alt-text',name:n.name,params:{name:n.name}});}
 }
 const flagged=new Set<string>();
 for(const frame of doc.nodes.filter(n=>n.kind==='frame'&&!n.hidden)){const fb=layout.bounds.get(frame.id);if(!fb)continue;
  const walk=(id:string,ox:number,oy:number,depth:number)=>{if(depth>64)return;for(const cid of map.get(id)?.children??[]){const cn=map.get(cid);if(!cn||cn.hidden)continue;const b=layout.bounds.get(cid);if(!b)continue;const x=ox+b.x,y=oy+b.y;
   if(!flagged.has(cid)&&findings.length<MAX_FINDINGS&&(x<-.5||y<-.5||x+b.width>fb.width+.5||y+b.height>fb.height+.5)){flagged.add(cid);findings.push({id:`overflow-${cid}`,layerId:cid,kind:'overflow',name:cn.name,params:{name:cn.name,frame:frame.name}});}
   walk(cid,x,y,depth+1);}};
  walk(frame.id,0,0,0);}
 return {findings,checked,skipped};
}
export interface FocusOrderEntry {id:string;name:string;kind:string;index:number;explicit:boolean;}
/** Reading/focus order over visible interactive layers: explicit focusIndex first, then document order. Display-safe (clones). */
export function interfaceFocusOrder(source:InterfaceDocument):FocusOrderEntry[]{
 const doc=parseInterfaceDocument(serializeInterfaceDocument(source)),pos=new Map(doc.nodes.map((n,i)=>[n.id,i]));
 return doc.nodes.filter(n=>!n.hidden&&n.prototypeLinks?.length).map(n=>({id:n.id,name:n.name,kind:n.kind,index:n.focusIndex??Number.MAX_SAFE_INTEGER,explicit:n.focusIndex!==undefined}))
  .sort((a,b)=>(a.index-b.index)||(pos.get(a.id)!-pos.get(b.id)!)).map((e,i)=>({...e,index:i}));
}
/** Move one interactive layer earlier/later in the focus order; normalizes explicit indices for all entries as one edit. */
export function moveInterfaceFocus(doc:InterfaceDocument,nodeId:string,delta:-1|1):void{
 const order=interfaceFocusOrder(doc),at=order.findIndex(e=>e.id===nodeId);if(at<0)throw Error('Select an interactive layer.');
 const swap=at+delta;if(swap<0||swap>=order.length)return;
 const ids=order.map(e=>e.id);const tmp=ids[at];ids[at]=ids[swap];ids[swap]=tmp;
 ids.forEach((id,i)=>{doc.nodes.find(n=>n.id===id)!.focusIndex=i;});
}
export interface VisionMode {id:'protanopia'|'deuteranopia'|'tritanopia';matrix:number[];}
/** View-only color-vision deficiency simulation matrices (full severity), 4x5 feColorMatrix form; RGB rows sum to 1, alpha passthrough. */
export const INTERFACE_VISION_MODES:VisionMode[]=[
 {id:'protanopia',matrix:[0.567,0.433,0,0,0,0.558,0.442,0,0,0,0,0.242,0.758,0,0,0,0,0,1,0]},
 {id:'deuteranopia',matrix:[0.625,0.375,0,0,0,0.7,0.3,0,0,0,0,0.3,0.7,0,0,0,0,0,1,0]},
 {id:'tritanopia',matrix:[0.95,0.05,0,0,0,0,0.433,0.567,0,0,0,0.475,0.525,0,0,0,0,0,1,0]},
];
export function interfaceVisionFilterValues(mode:string):string|undefined{return INTERFACE_VISION_MODES.find(v=>v.id===mode)?.matrix.join(' ');}
