import {registerCommandSpec} from '../commandBridge';
import {commandRegistry} from '../commandRegistry';
import type {CommandSchema,CommandSpec} from '../commandSpec';
import {EditError,type Edit} from './edit';
import {findComp,findLayer,TRANSFORM_KEYS,type LayerKind,type PropValue,type TransformKey} from './model';
import {animationSession} from './session';
import {secondsToTicks} from './time';
const fail=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
const open=()=>!!animationSession().document;
const doc=()=>animationSession().document??fail('No open animation.');
const comp=()=>findComp(doc())??fail('No active composition.');
const playhead=()=>animationSession().getState().view.playhead;
const selected=()=>{const id=animationSession().getState().view.selectedLayer;return id&&findLayer(comp(),id)?id:fail('Select a layer first.');};
const object=(properties:Record<string,unknown>,required=Object.keys(properties)):CommandSchema=>({type:'object',properties,required,additionalProperties:false});
const num={type:'number'};const tick={type:'integer',minimum:0};
const layerRef={type:'string',minLength:1,maxLength:200};
const propKey={enum:[...TRANSFORM_KEYS]};
const value={oneOf:[{type:'number'},{type:'array',items:{type:'number'},minItems:2,maxItems:2}]};
const guard=<T,>(fn:()=>T):T=>{try{return fn();}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}};
const run=(e:Edit|readonly Edit[])=>guard(()=>animationSession().dispatch(e).revision);
/** Typed `animation.*` command specs. All document mutations dispatch into the one session transaction/undo owner. */
export function animationCommandSpecs():CommandSpec<unknown,unknown>[]{
 type Cat=CommandSpec['category'];
 const spec=<P,>(id:string,title:string,fn:(p:P)=>unknown,params?:CommandSchema,enabled:()=>boolean=open,category:Cat='Edit'):CommandSpec<P,unknown>=>({id,title,category,level:'ui',params,enabled,keywords:['animation','timeline','keyframe'],run:fn});
 const layerIdOf=(p:{layer?:string})=>p.layer??selected();
 return [
  spec('animation.project.new','New animation',()=>{animationSession().createBlank();},undefined,()=>true,'Project'),
  spec('animation.project.recover','Restore last animation session',()=>{if(!animationSession().recover())fail('No recoverable animation session was found.');},undefined,()=>true,'Project'),
  spec('animation.render.open','Render setup',()=>animationSession().setRenderSetup(true),undefined,open,'Project'),
  spec('animation.render.close','Close render setup',()=>animationSession().setRenderSetup(false),undefined,()=>animationSession().getState().renderSetup,'Project'),
  spec('animation.edit.undo','Undo animation edit',()=>animationSession().undo(),undefined,()=>animationSession().getState().canUndo),
  spec('animation.edit.redo','Redo animation edit',()=>animationSession().redo(),undefined,()=>animationSession().getState().canRedo),
  spec('animation.comp.add','Add composition',(p:{name?:string;width?:number;height?:number})=>run({type:'comp.add',settings:p}),object({name:{type:'string',maxLength:200},width:{type:'integer',minimum:1,maximum:16384},height:{type:'integer',minimum:1,maximum:16384}},[]),open,'Insert'),
  spec('animation.comp.update','Change composition settings',(p:{name?:string;width?:number;height?:number;seconds?:number;fps?:number;background?:string})=>{
   const {seconds,fps,...rest}=p;return run({type:'comp.update',settings:{...rest,...(seconds!==undefined?{duration:secondsToTicks(seconds)}:{}),...(fps!==undefined?{fps:{num:Math.round(fps),den:1}}:{})}});},
   object({name:{type:'string',maxLength:200},width:{type:'integer',minimum:1,maximum:16384},height:{type:'integer',minimum:1,maximum:16384},seconds:{type:'number',minimum:0.01,maximum:3600},fps:{type:'integer',minimum:1,maximum:240},background:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'}},[])),
  spec('animation.comp.select','Switch composition',(p:{comp:string})=>run({type:'comp.select',comp:p.comp}),object({comp:layerRef}),open,'View'),
  spec('animation.layer.add','Add layer',(p:{kind:LayerKind})=>{run({type:'layer.add',kind:p.kind});const c=comp();animationSession().setView({selectedLayer:c.layers[0]?.id??null});},object({kind:{enum:['solid','text','shape','null']}}),open,'Insert'),
  spec('animation.layer.remove','Delete layer',(p:{layer?:string})=>{run({type:'layer.remove',layer:layerIdOf(p)});animationSession().setView({selectedLayer:null,selectedKey:null});},object({layer:layerRef},[])),
  spec('animation.layer.update','Edit layer',(p:{layer?:string;name?:string;visible?:boolean;solo?:boolean;locked?:boolean;text?:string;size?:number;color?:string})=>{
   const {layer,text,size,color,...flags}=p;const source={...(text!==undefined?{text}:{}),...(size!==undefined?{size}:{}),...(color!==undefined?{color}:{})};
   return run({type:'layer.update',layer:layer??selected(),...flags,...(Object.keys(source).length?{source}:{})});},
   object({layer:layerRef,name:{type:'string',maxLength:200},visible:{type:'boolean'},solo:{type:'boolean'},locked:{type:'boolean'},text:{type:'string',maxLength:2000},size:{type:'number',minimum:1,maximum:2000},color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'}},[])),
  spec('animation.layer.timing','Set layer in and out',(p:{layer?:string;inT:number;outT:number})=>run({type:'layer.timing',layer:layerIdOf(p),inT:p.inT,outT:p.outT}),object({layer:layerRef,inT:tick,outT:tick},['inT','outT'])),
  spec('animation.layer.parent','Set layer parent',(p:{layer?:string;parent:string|null})=>run({type:'layer.parent',layer:layerIdOf(p),parent:p.parent}),{type:'object',properties:{layer:layerRef,parent:{type:['string','null']}},required:['parent'],additionalProperties:false}),
  spec('animation.layer.reorder','Reorder layer',(p:{layer?:string;index:number})=>run({type:'layer.reorder',layer:layerIdOf(p),index:p.index}),object({layer:layerRef,index:{type:'integer',minimum:0}},['index'])),
  spec('animation.prop.set','Set property value',(p:{layer?:string;prop:TransformKey;value:PropValue;t?:number})=>run({type:'prop.set',layer:layerIdOf(p),prop:p.prop,value:p.value,t:p.t??playhead()}),object({layer:layerRef,prop:propKey,value,t:tick},['prop','value'])),
  spec('animation.prop.animate','Toggle property animation',(p:{layer?:string;prop:TransformKey;on:boolean})=>run({type:'prop.animate',layer:layerIdOf(p),prop:p.prop,on:p.on,t:playhead()}),object({layer:layerRef,prop:propKey,on:{type:'boolean'}},['prop','on'])),
  spec('animation.key.add','Add keyframe at playhead',(p:{layer?:string;prop:TransformKey;t?:number})=>run({type:'key.add',layer:layerIdOf(p),prop:p.prop,t:p.t??playhead()}),object({layer:layerRef,prop:propKey,t:tick},['prop'])),
  spec('animation.key.remove','Remove keyframe',(p:{layer?:string;prop:TransformKey;t?:number})=>run({type:'key.remove',layer:layerIdOf(p),prop:p.prop,t:p.t??playhead()}),object({layer:layerRef,prop:propKey,t:tick},['prop'])),
  spec('animation.key.move','Move keyframe',(p:{layer?:string;prop:TransformKey;from:number;to:number;replace?:boolean})=>run({type:'key.move',layer:layerIdOf(p),prop:p.prop,from:p.from,to:p.to,replace:p.replace}),object({layer:layerRef,prop:propKey,from:tick,to:tick,replace:{type:'boolean'}},['prop','from','to'])),
  spec('animation.key.interp','Set keyframe interpolation',(p:{layer?:string;prop:TransformKey;t?:number;interp:'hold'|'linear'|'bezier'})=>run({type:'key.interp',layer:layerIdOf(p),prop:p.prop,t:p.t??playhead(),interp:p.interp}),object({layer:layerRef,prop:propKey,t:tick,interp:{enum:['hold','linear','bezier']}},['prop','interp'])),
  spec('animation.playhead.set','Move playhead',(p:{seconds:number})=>animationSession().setView({playhead:secondsToTicks(p.seconds)}),object({seconds:num}),open,'View'),
 ] as CommandSpec<unknown,unknown>[];
}
export const ANIMATION_COMMANDS=animationCommandSpecs().map(s=>s.id);
const DESTRUCTIVE=new Set(['animation.layer.remove']);
export function registerAnimationCommands(){
 const offs=animationCommandSpecs().map(s=>{const off=registerCommandSpec(s);const c=commandRegistry.get(s.id);if(c){c.studio='animation';c.argsSchema=s.params;c.risk=DESTRUCTIVE.has(s.id)?'destructive':'content';}return off;});
 return()=>offs.forEach(off=>off());
}
