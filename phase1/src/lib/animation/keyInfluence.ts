import type {Edit} from './edit';
import type {Composition,KeyRef} from './model';
export const MIN_INFLUENCE=1,MAX_INFLUENCE=99,MAX_INFLUENCE_KEYS=800;
/** One keys.interp edit per selected bezier key: handle x becomes percent/100 on the out side and 1 - percent/100 on the in side, y values stay. Linear and hold keys are skipped. */
export function influenceEdits(comp:Composition,sel:readonly KeyRef[],percent:number):Edit[]{
 if(!Number.isFinite(percent)||percent<MIN_INFLUENCE||percent>MAX_INFLUENCE)throw Object.assign(new Error(`Use ${MIN_INFLUENCE} to ${MAX_INFLUENCE} percent.`),{expected:true});
 if(sel.length>MAX_INFLUENCE_KEYS)throw Object.assign(new Error('Too many keys.'),{expected:true});
 const x=Math.round(percent*100)/10000,want=new Set(sel.map(k=>`${k.layer}\0${k.prop}\0${k.t}`)),out:Edit[]=[];
 for(const l of comp.layers)for(const prop of Object.keys(l.transform) as KeyRef['prop'][])
  for(const k of l.transform[prop].keys){
   if(k.interp!=='bezier'||!want.has(`${l.id}\0${prop}\0${k.t}`))continue;
   const o:[number,number]=[x,k.out[1]],i:[number,number]=[Math.round((1-x)*1e4)/1e4,k.in[1]];
   if(o[0]===k.out[0]&&i[0]===k.in[0])continue;
   out.push({type:'keys.interp',keys:[{layer:l.id,prop,t:k.t}],interp:'bezier',out:o,in:i});
  }
 return out;
}
