import type {Composition,Layer,Property,Keyframe,MaskPath,LayerSource} from './model';
import {TICKS_PER_SECOND} from './time';
/**
 * Lottie (bodymovin 5.7) JSON of a composition. Pure leaf.
 * Covered: solid, null and shape layers (rectangle, rounded rectangle, ellipse, star, polygon, bezier paths with holes), a flat fill, a stroke,
 * parenting, in and out points and every transform property with its keys, temporal ease handles and spatial tangents.
 * Everything else is left out and counted by kind in `left`: text, images, nested compositions and audio (`media`/`text`), mattes (`matte`),
 * effects, masks, repeaters and path effects (`effects`), gradients and colour keys, flattened to a plain colour (`colour`), and
 * modifiers, stroke trim or dash and per-channel ease (`motion`).
 */
export type LottieGap='text'|'media'|'matte'|'effects'|'colour'|'motion';
export interface LottieResult{json:string;layers:number;left:LottieGap[]}
export const MAX_LOTTIE_LAYERS=300;
const r3=(n:number)=>Math.round(n*1000)/1000;
const rgb=(hex:string|undefined,fallback='#000000'):number[]=>{const h=/^#[0-9a-fA-F]{6}$/.test(hex??'')?hex!:fallback;return [1,3,5].map(i=>r3(parseInt(h.slice(i,i+2),16)/255)).concat(1);};
type Dim='p'|'a'|'s'|'r'|'o';
export function lottieFromComposition(c:Composition):LottieResult{
 const left=new Set<LottieGap>(),fr=c.fps.num/c.fps.den,toF=(t:number)=>r3((t-c.start)*c.fps.num/(c.fps.den*TICKS_PER_SECOND));
 const mattes=new Set(c.layers.flatMap(l=>l.matte?[l.matte.source]:[]));
 const byId=new Map(c.layers.map(l=>[l.id,l]));
 const exportable=(l:Layer)=>(l.kind==='solid'||l.kind==='null'||l.kind==='shape')&&!l.matte&&!mattes.has(l.id);
 // A skipped layer that is the parent of an exported one stays as a null so the transforms still chain.
 const keep=new Set<string>();
 for(const l of c.layers)if(exportable(l)){keep.add(l.id);for(let p=l.parent?byId.get(l.parent):undefined,n=0;p&&n<50;p=p.parent?byId.get(p.parent):undefined,n++)keep.add(p.id);}
 for(const l of c.layers)if(!keep.has(l.id))left.add(l.kind==='text'?'text':l.matte||mattes.has(l.id)?'matte':'media');
 const ind=new Map<string,number>();let k=0;for(const l of c.layers)if(keep.has(l.id))ind.set(l.id,++k);
 const val=(d:Dim,v:number|readonly number[]):number[]=>typeof v==='number'?[r3(v)]:d==='s'?[r3(v[0]),r3(v[1]),100]:[r3(v[0]),r3(v[1]),0];
 const prop=(d:Dim,p:Property):{a:0|1;k:unknown}=>{
  if(p.modifiers?.length)left.add('motion');
  if(!p.keys.length)return {a:0,k:d==='r'||d==='o'?(typeof p.value==='number'?r3(p.value):0):val(d,p.value)};
  const ks=p.keys.map((a:Keyframe,i):Record<string,unknown>=>{
   const b=p.keys[i+1],o:Record<string,unknown>={t:toF(a.t),s:val(d,a.v)};
   if(!b)return o;
   if(a.channelOut)left.add('motion');
   if(a.interp==='hold')o.h=1;
   else{
    const out=a.interp==='linear'?[0,0]:a.out,inn=a.interp==='linear'?[1,1]:b.in;
    o.o={x:[r3(out[0])],y:[r3(out[1])]};o.i={x:[r3(inn[0])],y:[r3(inn[1])]};
    if(d==='p'&&((a.sOut&&(a.sOut[0]||a.sOut[1]))||(b.sIn&&(b.sIn[0]||b.sIn[1])))){o.to=[...(a.sOut??[0,0]).map(r3),0];o.ti=[...(b.sIn??[0,0]).map(r3),0];}
   }
   return o;
  });
  return {a:1,k:ks};
 };
 const path=(q:MaskPath,w:number,h:number)=>({c:q.closed,v:q.points.map(p=>[r3(p.x*w),r3(p.y*h)]),i:q.points.map(p=>[r3((p.inX??0)*w),r3((p.inY??0)*h)]),o:q.points.map(p=>[r3((p.outX??0)*w),r3((p.outY??0)*h)])});
 const radial=(s:LayerSource,w:number,h:number):MaskPath=>{
  const n=s.sides??5,star=s.shape==='star',cnt=star?n*2:n,ratio=s.innerRatio??0.45;
  return {closed:true,points:Array.from({length:cnt},(_,i)=>{const a=-Math.PI/2+i*2*Math.PI/cnt,r=star&&i%2?ratio:1;return {x:(w/2+Math.cos(a)*w/2*r)/w,y:(h/2+Math.sin(a)*h/2*r)/h};})};
 };
 const shapes=(l:Layer)=>{
  const s=l.source,w=s.width??0,h=s.height??0,items:unknown[]=[];
  if(s.shape==='ellipse')items.push({ty:'el',nm:'Ellipse',p:{a:0,k:[r3(w/2),r3(h/2)]},s:{a:0,k:[w,h]}});
  else if(s.shape==='path'&&s.path){
   items.push({ty:'sh',nm:'Path',ks:{a:0,k:path(s.path,w||1,h||1)}});
   for(const q of s.subpaths??[])items.push({ty:'sh',nm:'Hole',ks:{a:0,k:path(q as MaskPath,w||1,h||1)}});
   if(s.pathKeys?.length||l.pathFx)left.add('effects');
  }else if(s.shape==='star'||s.shape==='polygon')items.push({ty:'sh',nm:'Shape',ks:{a:0,k:path(radial(s,w||1,h||1),w||1,h||1)}});
  else items.push({ty:'rc',nm:'Rectangle',p:{a:0,k:[r3(w/2),r3(h/2)]},s:{a:0,k:[w,h]},r:{a:0,k:s.shape==='roundedRect'?Math.min(s.radius??24,w/2,h/2):0}});
  if(s.gradient||l.colorKeys?.fill)left.add('colour');
  const st=l.stroke;
  if(st){
   items.push({ty:'st',nm:'Stroke',c:{a:0,k:rgb(st.color)},o:{a:0,k:st.opacity??100},w:{a:0,k:st.width},lc:st.cap==='round'?2:st.cap==='square'?3:1,lj:st.join==='round'?2:st.join==='bevel'?3:1,ml:st.miter??4});
   if(st.trim||st.dash||st.dashLen!==undefined||st.dashGap!==undefined||st.widthAnim||st.gradient||l.colorKeys?.stroke)left.add('motion');
  }
  items.push({ty:'fl',nm:'Fill',c:{a:0,k:rgb(s.color)},o:{a:0,k:100},r:s.shape==='path'&&s.subpaths?.length?2:1});
  items.push({ty:'tr',p:{a:0,k:[0,0]},a:{a:0,k:[0,0]},s:{a:0,k:[100,100]},r:{a:0,k:0},o:{a:0,k:100}});
  return [{ty:'gr',nm:'Group',it:items}];
 };
 const layers=c.layers.filter(l=>keep.has(l.id)).slice(0,MAX_LOTTIE_LAYERS).map(l=>{
  const asNull=!exportable(l);
  if(asNull){left.add(l.kind==='text'?'text':l.matte||mattes.has(l.id)?'matte':'media');}
  if(l.effects?.length||l.repeater||l.masks?.length)left.add('effects');
  const t=l.transform;
  const base:Record<string,unknown>={ddd:0,ind:ind.get(l.id),ty:asNull||l.kind==='null'?3:l.kind==='solid'?1:4,nm:l.name,sr:1,
   ks:{o:prop('o',t.opacity),r:prop('r',t.rotation),p:prop('p',t.position),a:prop('a',t.anchor),s:prop('s',t.scale)},
   ao:0,ip:toF(l.inT+l.offset),op:toF(l.outT+l.offset),st:0,bm:0};
  if(l.parent&&ind.has(l.parent))base.parent=ind.get(l.parent);
  if(!l.visible)base.hd=true;
  if(!asNull&&l.kind==='solid'){base.sw=l.source.width??c.width;base.sh=l.source.height??c.height;base.sc='#'+(l.source.color??'#000000').replace('#','').padEnd(6,'0').slice(0,6);}
  if(!asNull&&l.kind==='shape')base.shapes=shapes(l);
  return base;
 });
 if(c.layers.length>MAX_LOTTIE_LAYERS)left.add('media');
 const json=JSON.stringify({v:'5.7.4',fr:r3(fr),ip:0,op:toF(c.start+c.duration),w:c.width,h:c.height,nm:c.name,ddd:0,assets:[],layers});
 return {json,layers:layers.length,left:[...left]};
}
