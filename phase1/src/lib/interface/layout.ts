import {resolveInterfaceValues,resolvedTextStyle} from './tokens';
import type {InterfaceDocument,InterfaceNode} from './model';
import {DEFAULT_LAYOUT,DEFAULT_SIZING,type ConstraintMode} from './schema';
export interface LayoutBounds {x:number;y:number;width:number;height:number;}
export interface LayoutResult {bounds:Map<string,LayoutBounds>;diagnostics:string[];}
const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
function constrained(pos:number,size:number,current:number,base:number,mode:ConstraintMode):[number,number]{const delta=current-base;return mode==='end'?[pos+delta,size]:mode==='center'?[pos+delta/2,size]:mode==='stretch'?[pos,Math.max(1,size+delta)]:mode==='scale'?[pos*current/base,Math.max(1,size*current/base)]:[pos,size];}
/** One deterministic, bounded layout interpretation. Bounds are caches, never source content. */
export function computeInterfaceLayout(doc:InterfaceDocument):LayoutResult{
 const resolved=resolveInterfaceValues(doc);doc=resolved.document;
 const nodes=new Map(doc.nodes.map(n=>[n.id,n])),bounds=new Map<string,LayoutBounds>(),diagnostics:string[]=[...resolved.diagnostics];
 const intrinsic=new Map<string,[number,number]>();
 const measure=(n:InterfaceNode):[number,number]=>{
  const cached=intrinsic.get(n.id);if(cached)return cached;
  const l=n.layout??DEFAULT_LAYOUT,z=n.sizing??DEFAULT_SIZING;let w=n.width,h=n.height;
  const children=n.children.map(id=>nodes.get(id)!).filter(n=>!n.hidden&&!(n.sizing??DEFAULT_SIZING).absolute);const sizes=children.map(measure);
  if(z.width==='hug'||z.height==='hug'){
   if(n.kind==='text'){const style=resolvedTextStyle(doc,n);if(z.width==='hug')w=Math.max(1,(n.text??'').split('\n').reduce((max,line)=>Math.max(max,line.length),0)*style.fontSize*.5);if(z.height==='hug')h=Math.max(style.fontSize*style.lineHeight,(n.text??'').split('\n').length*style.fontSize*style.lineHeight);diagnostics.push(`Text ${n.name}: Hug uses approximate metrics; font measurement is pending.`);}
   else if(l.direction==='grid'){const cols=l.columns??2,rows=Math.ceil(children.length/cols);const cellW=Math.max(1,...sizes.map(s=>s[0]));if(z.width==='hug')w=cols*cellW+Math.max(0,cols-1)*l.gap+l.padding[1]+l.padding[3];if(z.height==='hug'){let total=0;for(let i=0;i<sizes.length;i+=cols)total+=Math.max(1,...sizes.slice(i,i+cols).map(s=>s[1]));h=total+Math.max(0,rows-1)*l.gap+l.padding[0]+l.padding[2];}}
   else if(l.direction!=='free'){
    const horizontal=l.direction==='row';let main=sizes.reduce((sum,size)=>sum+size[horizontal?0:1],0)+Math.max(0,sizes.length-1)*l.gap,cross=Math.max(0,...sizes.map(size=>size[horizontal?1:0]));
    if(l.wrap&&z[horizontal?'width':'height']!=='hug'){
     const available=Math.max(0,(horizontal?w:h)-(horizontal?l.padding[1]+l.padding[3]:l.padding[0]+l.padding[2]));let used=0,lineCross=0,totalCross=0,lines=0;
     for(const size of sizes){const childMain=size[horizontal?0:1],childCross=size[horizontal?1:0];if(used&&used+l.gap+childMain>available){totalCross+=lineCross+(lines?l.gap:0);lines++;used=0;lineCross=0;}used+=childMain+(used?l.gap:0);lineCross=Math.max(lineCross,childCross);}cross=totalCross+lineCross+(lines?l.gap:0);
    }
    if(z.width==='hug')w=(horizontal?main:cross)+l.padding[1]+l.padding[3];if(z.height==='hug')h=(horizontal?cross:main)+l.padding[0]+l.padding[2];
    if(l.wrap)diagnostics.push(`Frame ${n.name}: Hug wrapping uses unwrapped intrinsic size on the Hug axis.`);
   }else{if(z.width==='hug')w=Math.max(1,...children.map((c,i)=>c.x+sizes[i][0]));if(z.height==='hug')h=Math.max(1,...children.map((c,i)=>c.y+sizes[i][1]));}
  }
  const result:[number,number]=[clamp(w,z.minWidth,z.maxWidth),clamp(h,z.minHeight,z.maxHeight)];intrinsic.set(n.id,result);return result;
 };
 const place=(n:InterfaceNode,b:LayoutBounds,depth:number)=>{
  if(depth>64)throw Error('Layout depth exceeded.');bounds.set(n.id,b);const l=n.layout??DEFAULT_LAYOUT,z=n.sizing??DEFAULT_SIZING;
  const children=n.children.map(id=>nodes.get(id)!);const flowing=children.filter(c=>!c.hidden&&!(c.sizing??DEFAULT_SIZING).absolute&&l.direction!=='free');
  const horizontal=l.direction==='row',innerW=Math.max(0,b.width-l.padding[1]-l.padding[3]),innerH=Math.max(0,b.height-l.padding[0]-l.padding[2]),available=horizontal?innerW:innerH;
  if(l.direction==='grid'){
   const columns=l.columns??2,cellWidth=Math.max(1,(innerW-Math.max(0,columns-1)*l.gap)/columns);let y=l.padding[0];
   for(let start=0;start<flowing.length;start+=columns){const row=flowing.slice(start,start+columns),rowHeight=Math.max(1,...row.map(c=>measure(c)[1]));row.forEach((child,index)=>{const [w,h]=measure(child),cz=child.sizing??DEFAULT_SIZING;const width=cz.width==='fill'||l.align==='stretch'?clamp(cellWidth,cz.minWidth,cz.maxWidth):w;const height=cz.height==='fill'||l.align==='stretch'?clamp(rowHeight,cz.minHeight,cz.maxHeight):h;const align=l.align==='center'?(cellWidth-width)/2:l.align==='end'?cellWidth-width:0;place(child,{x:l.padding[3]+index*(cellWidth+l.gap)+align,y,width,height},depth+1);});y+=rowHeight+l.gap;}
  }
  const lines:InterfaceNode[][]=l.direction==='grid'?[]:[[]];let used=0;
  for(const child of l.direction==='grid'?[]:flowing){const cz=child.sizing??DEFAULT_SIZING;const size=measure(child);const main=cz[horizontal?'width':'height']==='fill'?cz[horizontal?'minWidth':'minHeight']:size[horizontal?0:1];if(l.wrap&&lines.at(-1)!.length&&used+l.gap+main>available){lines.push([]);used=0;}used+=main+(lines.at(-1)!.length?l.gap:0);lines.at(-1)!.push(child);}
  let crossOffset=horizontal?l.padding[0]:l.padding[3];
  for(const line of lines){if(!line.length)continue;
   const mainMode=horizontal?'width':'height',crossMode=horizontal?'height':'width';const hugMain=z[mainMode]==='hug';
   const fills=line.filter(c=>(c.sizing??DEFAULT_SIZING)[mainMode]==='fill');
   const fixed=line.filter(c=>!fills.includes(c)).reduce((sum,c)=>sum+measure(c)[horizontal?0:1],0);
   const free=Math.max(0,available-fixed-Math.max(0,line.length-1)*l.gap);const allocation=new Map<string,number>();
   // Water-fill redistribution respects each child's min/max, without changing semantic Fill intent.
   let remaining=free,unresolved=[...fills];for(let rounds=0;unresolved.length&&rounds<=fills.length;rounds++){
    const share=remaining/unresolved.length;const hit=unresolved.filter(c=>{const cz=c.sizing??DEFAULT_SIZING;return share<cz[horizontal?'minWidth':'minHeight']||share>cz[horizontal?'maxWidth':'maxHeight'];});
    if(!hit.length){unresolved.forEach(c=>allocation.set(c.id,share));break;}for(const c of hit){const cz=c.sizing??DEFAULT_SIZING,value=clamp(share,cz[horizontal?'minWidth':'minHeight'],cz[horizontal?'maxWidth':'maxHeight']);allocation.set(c.id,value);remaining=Math.max(0,remaining-value);}unresolved=unresolved.filter(c=>!hit.includes(c));
   }
   const cross=Math.max(1,...line.map(c=>measure(c)[horizontal?1:0]));const lineCross=l.wrap?cross:(horizontal?innerH:innerW);let offset=horizontal?l.padding[3]:l.padding[0];
   for(const child of line){const cz=child.sizing??DEFAULT_SIZING,[iw,ih]=measure(child);let main=horizontal?iw:ih,crossSize=horizontal?ih:iw;
    if(cz[mainMode]==='fill'){if(hugMain){diagnostics.push(`Frame ${n.name}: parent Hug / child Fill uses the child's intrinsic size.`);}else main=allocation.get(child.id)??main;}
    if(cz[crossMode]==='fill'&&z[crossMode]==='hug')diagnostics.push(`Frame ${n.name}: parent Hug / child Fill uses the child's intrinsic size.`);
    if((cz[crossMode]==='fill'&&z[crossMode]!=='hug')||l.align==='stretch')crossSize=clamp(lineCross,cz[horizontal?'minHeight':'minWidth'],cz[horizontal?'maxHeight':'maxWidth']);
    const align=l.align==='center'?(lineCross-crossSize)/2:l.align==='end'?lineCross-crossSize:0;
    place(child,{x:horizontal?offset:crossOffset+align,y:horizontal?crossOffset+align:offset,width:horizontal?main:crossSize,height:horizontal?crossSize:main},depth+1);offset+=main+l.gap;
   }crossOffset+=lineCross+l.gap;
  }
  for(const child of children.filter(c=>!flowing.includes(c))){const [w,h]=measure(child);let cb:LayoutBounds={x:child.x,y:child.y,width:w,height:h};if(child.constraints){const c=child.constraints;const [x,width]=constrained(child.x,w,b.width,c.parentWidth,c.horizontal),[y,height]=constrained(child.y,h,b.height,c.parentHeight,c.vertical);const cz=child.sizing??DEFAULT_SIZING;cb={x,y,width:clamp(width,cz.minWidth,cz.maxWidth),height:clamp(height,cz.minHeight,cz.maxHeight)};}place(child,cb,depth+1);}
 };
 for(const p of doc.pages)for(const id of p.children){const n=nodes.get(id)!;const [width,height]=measure(n);place(n,{x:n.x,y:n.y,width,height},1);}
 return {bounds,diagnostics:[...new Set(diagnostics)]};
}
