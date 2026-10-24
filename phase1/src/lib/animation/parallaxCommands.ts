import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Composition,type Layer,type Vec2} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {parentMatrix,invertMatrix} from './scene';
import {evaluateMod} from './modifiers';
/** Parallax: the ticked layers, far to near in tick order, drift (or grow) over the work area by an amount that rises with depth, so the nearest layer moves most. Two linear keys per layer. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_PARALLAX_LAYERS=20,PARALLAX_MODES=['left','right','up','down','push'] as const;
export type ParallaxMode=typeof PARALLAX_MODES[number];
/** Share of the full movement for the layer at `index` of `count`, far (first) to near (last): 1/count .. 1. */
export const depthShare=(index:number,count:number):number=>(index+1)/Math.max(1,count);
export const defaultAmount=(m:ParallaxMode):number=>m==='push'?20:10;
const round2=(n:number)=>Math.round(n*100)/100;
export const parallaxSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.parallax',title:'Parallax: drift the ticked layers, far to near',category:'Edit',level:'ui',keywords:['animation','parallax','depth','pan','drift','dolly','push in','layers','background','scroll'],
 params:{type:'object',properties:{mode:{enum:[...PARALLAX_MODES]},amount:{type:'number',minimum:1,maximum:100},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:2,maxItems:MAX_PARALLAX_LAYERS}},required:['mode'],additionalProperties:false},
 // The Rig menu passes its ticked layers in tick order: the first is the farthest, the last the nearest.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>1;},
 run:((p:{mode?:ParallaxMode;amount?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c:Composition|undefined=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const mode=p.mode;if(!mode||!PARALLAX_MODES.includes(mode))return expected('Choose left, right, up, down or push in.');
  const amount=p.amount??defaultAmount(mode);if(!Number.isFinite(amount)||amount<1||amount>100)return expected('The amount is 1 to 100 percent.');
  const all=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_PARALLAX_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l);
  if(all.length<2)return expected('Tick the layers from far to near, at least two.');
  const a=c.workArea.in,b=c.workArea.out;if(b<=a)return expected('The work area is empty.');
  const edits:Edit[]=[];let moved=0,skipped=0;
  all.forEach((l,i)=>{
   const share=depthShare(i,all.length),prop=mode==='push'?'scale':'position',cur=l.transform[prop];
   if(l.locked||l.kind==='audio'||cur.keys.length>0){skipped++;return;}
   let end:Vec2;const start=evaluateMod(cur,a) as Vec2;
   if(mode==='push'){const g=1+amount/100*share;end=[round2(start[0]*g),round2(start[1]*g)];}
   else{const dist=(mode==='left'||mode==='right'?c.width:c.height)*amount/100*share,w:Vec2=mode==='left'?[-dist,0]:mode==='right'?[dist,0]:mode==='up'?[0,-dist]:[0,dist];
    const inv=invertMatrix(parentMatrix(c,l,a));if(!inv){skipped++;return;}
    end=[round2(start[0]+inv[0]*w[0]+inv[2]*w[1]),round2(start[1]+inv[1]*w[0]+inv[3]*w[1])];}
   for(const [t,v] of [[a,start],[b,end]] as const)edits.push({type:'key.add',layer:l.id,prop,t},{type:'prop.set',layer:l.id,prop,t,value:v as never},{type:'key.interp',layer:l.id,prop,t,interp:'linear'});
   moved++;});
  if(!edits.length)return expected('The ticked layers are locked or already have keys for this. Parallax only adds keys to layers that have none.');
  try{s.dispatch(edits);}catch(err){if(err instanceof EditError)throw Object.assign(err,{expected:true});throw err;}
  return {moved,skipped,mode,amount};
 }) as (p:unknown)=>unknown}];
