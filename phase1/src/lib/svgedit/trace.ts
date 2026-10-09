/** Bitmap to vector: trace an embedded <image> into filled paths (imagetracerjs, Unlicense). */
import {elementAt,parsePathKey,attr,applyPatches,insertChild,escapeValue,type XEl} from './source';
import * as C from './controller';
import {patchUi} from './store';
export interface TraceOpts{colors:number;detail:number;blur:number}
export const DEFAULT_TRACE:TraceOpts={colors:8,detail:1,blur:0};
export const MAX_EMBED=3_000_000;
export const isTraceable=(el:XEl)=>el.tag==='image'&&/^data:image\/(png|jpe?g|webp|gif);base64,/i.test((attr(el,'href')??attr(el,'xlink:href')??'').trim());
const loadImg=(src:string)=>new Promise<HTMLImageElement>((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('The image could not be decoded.'));i.src=src;});
export async function traceImage(key:string,o:TraceOpts=DEFAULT_TRACE):Promise<boolean>{
 const {root,text}=C.scan();if(!root)return false;const el=elementAt(root,parsePathKey(key));if(!el||!isTraceable(el)){patchUi({notice:'Select an embedded image to trace.'});return false;}
 try{
  const img=await loadImg((attr(el,'href')??attr(el,'xlink:href'))!.trim());
  const max=512,sc=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));const w=Math.max(1,Math.round(img.naturalWidth*sc)),h=Math.max(1,Math.round(img.naturalHeight*sc));
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;const cx=cv.getContext('2d')!;cx.drawImage(img,0,0,w,h);
  const {default:T}=await import('imagetracerjs');
  const svg=T.imagedataToSVG(cx.getImageData(0,0,w,h),{numberofcolors:o.colors,colorsampling:2,pathomit:Math.max(1,Math.round(8/o.detail)),ltres:1/o.detail,qtres:1/o.detail,blurradius:o.blur,blurdelta:20,strokewidth:0,roundcoords:1,viewbox:true,desc:false});
  const doc=new DOMParser().parseFromString(svg,'image/svg+xml');const paths=[...doc.querySelectorAll('path')];
  const out=paths.map(p=>{const fill=p.getAttribute('fill')??'#000';const op=p.getAttribute('opacity');return {d:p.getAttribute('d')??'',fill,op};}).filter(p=>p.d&&p.op!=='0');
  if(!out.length){patchUi({notice:'Nothing to trace: the image has no distinct shapes.'});return false;}
  const num=(n:string,d:number)=>{const v=parseFloat(attr(el,n)??'');return Number.isFinite(v)?v:d;};
  const x=num('x',0),y=num('y',0),W=num('width',img.naturalWidth),H=num('height',img.naturalHeight);
  const g=`<g id="trace" transform="translate(${x} ${y}) scale(${Math.round(W/w*10000)/10000} ${Math.round(H/h*10000)/10000})">${out.map(p=>`<path d="${escapeValue(p.d)}" fill="${escapeValue(p.fill)}"${p.op&&p.op!=='1'?` opacity="${escapeValue(p.op)}"`:''}/>`).join('')}</g>`;
  const parent=el.parent!;const idx=parent.children.indexOf(el);const next=parent.children[idx+1]??null;
  const t2=insertChild(text,parent,next,g);
  const n=idx+1;return C.commit(t2,[[...parsePathKey(key).slice(0,-1),n].join('.')]);
 }catch(e){patchUi({notice:String(e instanceof Error?e.message:e)});return false;}}
export async function placeImage(file:File):Promise<boolean>{
 if(file.size>MAX_EMBED){patchUi({notice:`Image is larger than ${MAX_EMBED/1e6} MB.`});return false;}
 if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)){patchUi({notice:'Only PNG, JPEG, WebP and GIF images can be placed.'});return false;}
 const url:string=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result));r.onerror=()=>rej(r.error);r.readAsDataURL(file);});
 const img=await loadImg(url);const vb=C.docBox();const sc=Math.min(1,(vb.w*.6)/img.naturalWidth,(vb.h*.6)/img.naturalHeight);
 const w=Math.round(img.naturalWidth*sc*100)/100,h=Math.round(img.naturalHeight*sc*100)/100;
 return C.addElement(`<image x="${Math.round(vb.x+(vb.w-w)/2)}" y="${Math.round(vb.y+(vb.h-h)/2)}" width="${w}" height="${h}" href="${url}"/>`,C.insertionParent());}
void applyPatches;
