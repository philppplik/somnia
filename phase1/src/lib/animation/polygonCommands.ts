import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,newId,makeTransform,prop,validSource} from './model';
import {EditError} from './edit';
import {polygonPath,MAX_POLY_SIDES,MIN_POLY_SIDES,MIN_INNER,MAX_INNER} from './polygonModel';
/** Add a regular polygon or star as a path layer. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const polygonSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.shape.polygon',title:'Add a polygon or star shape layer',category:'Insert',level:'ui',keywords:['animation','shape','polygon','star','triangle','pentagon','hexagon','path','add','insert','sides'],
 params:{type:'object',properties:{sides:{type:'integer',minimum:MIN_POLY_SIDES,maximum:MAX_POLY_SIDES},star:{type:'boolean'},inner:{type:'integer',minimum:MIN_INNER,maximum:MAX_INNER},radius:{type:'integer',minimum:4,maximum:4000},color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'}},required:['sides'],additionalProperties:false},
 enabled:()=>{const d=animationSession().document;return !!d&&!!findComp(d);},
 run:((p:{sides:number;star?:boolean;inner?:number;radius?:number;color?:string})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(!Number.isInteger(p?.sides)||p.sides<MIN_POLY_SIDES||p.sides>MAX_POLY_SIDES)return expected(`A polygon has ${MIN_POLY_SIDES} to ${MAX_POLY_SIDES} sides.`);
  const inner=p.inner??50;if(!Number.isInteger(inner)||inner<MIN_INNER||inner>MAX_INNER)return expected(`The inner radius is ${MIN_INNER} to ${MAX_INNER} percent.`);
  const R=p.radius??Math.max(8,Math.round(Math.min(c.width,c.height)/4));if(!Number.isInteger(R)||R<4||R>4000)return expected('The radius must be 4 to 4000 pixels.');
  if(p.color!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(p.color))return expected('Colour must be #rrggbb.');
  const id=newId('layer'),source={shape:'path' as const,color:p.color??'#ff7a59',width:2*R,height:2*R,path:polygonPath(p.sides,!!p.star,inner)};
  if(!validSource(source))return expected('That shape is not valid.');
  const tr=makeTransform(c.width,c.height);
  try{s.dispatch({type:'layer.add',kind:'shape',id,over:{name:p.star?`Star ${p.sides}`:`Polygon ${p.sides}`,source,transform:{...tr,position:prop('vec2',[c.width/2-R,c.height/2-R])}}});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  s.setView({selectedLayer:id,selectedKey:null});return {id};
 }) as (p:unknown)=>unknown}];
