/** Path booleans (union, subtract, intersect, exclude) on selected shapes. Curves stay curves (paper.js, MIT). */
import {scanSvg,elementAt,parsePathKey,attr,applyPatches,removePatch,type Patch,type XEl} from './source';
import {invert,apply,type Matrix} from './geometry';
import * as C from './controller';
import {patchUi,getUi} from './store';
export type BoolOp='unite'|'subtract'|'intersect'|'exclude';
const GEOM=new Set(['d','x','y','width','height','rx','ry','cx','cy','r','x1','y1','x2','y2','points','transform']);
export const booleanable=(el:XEl)=>el.tag==='path'||['rect','circle','ellipse','polygon'].includes(el.tag);
let paperP:Promise<any>|null=null;
async function paperLib(){if(!paperP)paperP=import('paper/dist/paper-core.js').then(m=>{const p=m.default;p.setup(document.createElement('canvas'));return p;});return paperP;}
const dOf=(el:XEl)=>el.tag==='path'?(attr(el,'d')??''):C.shapeD(el);
export async function booleanOp(keys:string[],op:BoolOp):Promise<boolean>{
 const ks=C.docOrder(C.topKeys(keys));const {root,text}=C.scan();if(!root)return false;
 if(ks.length<2){patchUi({notice:'Select at least two shapes.'});return false;}
 const els=ks.map(k=>elementAt(root,parsePathKey(k))!);
 if(els.some(e=>!e||!booleanable(e))){patchUi({notice:'Booleans work on paths and basic shapes. Convert text first.'});return false;}
 const parent0=C.parentToRoot(ks[0]);const paper=await paperLib();
 try{
  const shapes=els.map((el,i)=>{const d=dOf(el);const m:Matrix=C.keyToRoot(ks[i]);const p=new paper.CompoundPath({pathData:d,insert:false});
   p.transform(new paper.Matrix(m[0],m[1],m[2],m[3],m[4],m[5]));return p;});
  let acc=shapes[0];
  for(let i=1;i<shapes.length;i++){acc=acc[op](shapes[i],{insert:false});}
  const inv=invert(parent0);acc.transform(new paper.Matrix(inv[0],inv[1],inv[2],inv[3],inv[4],inv[5]));
  const d:string=acc.pathData;if(!d){patchUi({notice:'The result is empty.'});return false;}
  const first=els[0];const keep=first.attrs.filter(a=>!GEOM.has(a.name)).map(a=>text.slice(a.from,a.to));
  const fillOk=!keep.some(a=>a.startsWith('fill='))&&attr(first,'style')===undefined?' fill="#000000"':'';
  void fillOk;
  const nu=`<path d="${d}"${keep.length?' '+keep.join(' '):''}/>`;
  const patches:Patch[]=[{from:first.from,to:first.to,insert:nu}];for(const el of els.slice(1))patches.push(removePatch(text,el));
  void apply;void scanSvg;
  const ok=C.commit(applyPatches(text,patches),[ks[0]]);return ok;
 }catch(e){patchUi({notice:`Boolean failed: ${String(e)}`});return false;}
}
void getUi;
