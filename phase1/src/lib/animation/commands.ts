import {maskEdit,matteEdit,type MaskOp} from './masks';
import {pathLayerEdit,combinePathsEdits,booleanEdits,maskBooleanEdit,expandStrokeEdits,maskToLayerEdit,type PathLayerOp} from './pathLayer';
import {applyTextPresetEdit,deleteTextPresetEdit,saveTextPresetEdit,userTextPresets,animatorEdit,textPathEdit,type AnimatorOp,type TextPathOp} from './textAnimators';
import {presetEdits,type MotionPreset} from './presets';
import {newId} from './model';
import {pruneStyleKeys} from './keyLanes';
import type {Modifier} from './modifiers';
import {saveAnimationSnapshot} from './persistence';
import {registerCommandSpec} from '../commandBridge';
import {commandRegistry} from '../commandRegistry';
import type {CommandSchema,CommandSpec} from '../commandSpec';
import {EditError,styleKeyDeleteEdits,styleKeyShiftEdits,type Edit} from './edit';
import {findComp,findLayer,COLOR_EASES,type ColorEase,TEXT_FONTS,TRANSFORM_KEYS,type KeyRef,type LayerKind,type LayerEffect,type PropValue,type TextFont,type TransformKey} from './model';
import {animationSession} from './session';
import {setLayerPen,getLayerPen} from './maskSelection';
import {allTargetKeys,bounceTargetKeys,elasticTargetKeys,easeTargetKeys,staggerLayers} from './keyTargets';
import {downloadBlob} from './exportFrames';
import {clearLayerSet,layerSetIds} from './layerSet';
import {deleteEasingEdit,findEasing,saveEasingEdit} from './easingLibrary';
import {deleteMotionEdit,exportMotionsJson,findMotion,mergeMotionsEdit,motionEdits,motionFromKeys,parseMotionsJson,saveMotionEdit,userMotions} from './motionLibrary';
import {secondsToTicks,snapToFrame,frameToTick} from './time';
import {ClipError,copyKeys,getKeyClip,pastedRefs,setKeyClip} from './keyclip';
import {allKeysOf,pruneSelection,shiftSelection} from './selection';
import {EASE_PRESETS,type EasePreset} from './graph';
import {copyCurve,pasteCurveEdit} from './graphTools';
import {toParentDelta} from './snap';
import {evaluate} from './interpolate';
import {addGuide,normalizeOverlays,OVERLAY_KEYS,type OverlayKey} from './guides';
import {buildTemplate,layerTemplates} from './layerTemplates';
import {templateEdits,TEMPLATE_IDS,TEMPLATE_LAYERS,type TemplateId} from './templates';
import {reactiveKeys,REACTIVE_PROPS,MAX_SMOOTH,type ReactiveProp} from './audioReactive';
import {detectBeats,beatMarkers,BEAT_LABEL,estimateBpm,gridTicks} from './audioBeats';
import {quantizeMoves} from './keyQuantize';
import {nextTrackHeight,setAllTracks,setTrackHeight,trackHeightOf,setShyHidden,shyHidden,fitAll,fitRange,setTimelineSnap,timelineSnap as timelineSnapNow,timeWindow,zoomAround} from './timelineView';
import {applyExportPreset,resetExportSettings,setExportSettings,exportApng,exportCurrentFrame,exportGif,exportWebM,exportWorkAreaSequence} from './exportJob';
import {ExportError} from './exportFrames';
import {renderQueueSpecs} from './renderQueueCommands';
import {templateRenameSpecs} from './templateCommands';
import {onionSpecs} from './onionCommands';
import {rigSpecs} from './rigCommands';
import {keyStretchSpecs} from './keyStretchCommands';
import {layerTimingSpecs} from './layerTimingCommands';
import {keyValuesSpecs} from './keyValuesCommands';
import {keyNthSpecs} from './keyNthCommands';
import {keyDistributeSpecs} from './keyDistributeCommands';
import {keyToPlayheadSpecs} from './keyToPlayheadCommands';
import {keyJitterTimeSpecs} from './keyJitterTimeCommands';
import {keyPropertySpecs} from './keyPropertyCommands';
import {keyThinSpecs} from './keyThinCommands';
import {keyMatchSpecs} from './keyMatchCommands';
import {keyFlattenSpecs} from './keyFlattenCommands';
import {keyEaseCopySpecs} from './keyEaseCopyCommands';
import {keyRampSpecs} from './keyRampCommands';
import {keyPeaksSpecs} from './keyPeaksCommands';
import {keyInvertSelectionSpecs} from './keyInvertSelectionCommands';
import {keyInfluenceSpecs} from './keyInfluenceCommands';
import {keyTameSpecs} from './keyTameCommands';
import {keyEchoSpecs} from './keyEchoCommands';
import {keyAllSpecs} from './keyAllCommands';
import {keyTrimSpecs} from './keyTrimCommands';
import {keyWorkAreaSpecs} from './keyWorkAreaCommands';
import {keyInWorkAreaSpecs} from './keyInWorkAreaCommands';
import {keyPlayheadSelectSpecs} from './keyPlayheadSelectCommands';
import {keyEaseRandomSpecs} from './keyEaseRandomCommands';
import {keyRangeSpecs} from './keyRangeCommands';
import {keyInvertSpecs} from './keyInvertCommands';
import {keyReverseSpecs} from './keyReverseCommands';
import {keyRepeatSpecs} from './keyRepeatCommands';
import {keySetClipSpecs,copySelection,cutSelection,pasteSelection,needsSetPaste,hasKeySelection} from './keySetClipCommands';
import {EXPORT_PRESETS} from './exportSettings';
/** Window event the Compositions panel listens for to open the audio file chooser. */
export const AUDIO_IMPORT_EVENT='somnia:animation-audio-import';
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
const modifierSchema={type:'object',properties:{type:{enum:['wiggle','loop','link']},seed:{type:'integer',minimum:0,maximum:2147483647},amplitude:{type:'number',minimum:0,maximum:10000},frequency:{type:'number',exclusiveMinimum:0,maximum:100},mode:{enum:['cycle','pingpong','offset']},layer:layerRef,prop:propKey,multiplier:{type:'number',minimum:-1000,maximum:1000},offset:{type:'number',minimum:-100000,maximum:100000}},required:['type'],additionalProperties:false};

const handleSchema={type:'array',items:{type:'number',minimum:-2,maximum:3},minItems:2,maxItems:2};
const value={oneOf:[{type:'number'},{type:'array',items:{type:'number'},minItems:2,maxItems:2}]};
const guard=<T,>(fn:()=>T):T=>{try{return fn();}catch(e){if(e instanceof EditError||e instanceof ClipError)throw Object.assign(e,{expected:true});throw e;}};
const selKeys=():KeyRef[]=>{const k=pruneSelection(animationSession().document,animationSession().getState().view.selectedKeys);return k.length?k:fail('Select keys first.');};
const hasSel=()=>open()&&pruneSelection(animationSession().document,animationSession().getState().view.selectedKeys).length>0;
const keyRefs={type:'array',items:object({layer:layerRef,prop:propKey,t:tick}),minItems:1,maxItems:500};
const run=(e:Edit|readonly Edit[])=>guard(()=>animationSession().dispatch(e).revision);
/** Typed `animation.*` command specs. All document mutations dispatch into the one session transaction/undo owner. */
export function animationCommandSpecs():CommandSpec<unknown,unknown>[]{
 type Cat=CommandSpec['category'];
 const spec=<P,>(id:string,title:string,fn:(p:P)=>unknown,params?:CommandSchema,enabled:()=>boolean=open,category:Cat='Edit',shortcut?:string):CommandSpec<P,unknown>=>({id,title,category,level:'ui',params,enabled,keywords:['animation','timeline','keyframe'],run:fn,...(shortcut?{shortcut}:{})});
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
  spec('animation.precomp.make','Precompose selected layers',(p:{layers?:string[];name?:string})=>{const ids=p.layers??layerSetIds(animationSession().getState().view.selectedLayer);if(!ids.length)fail('Select a layer first.');
   const id=newId('layer');run({type:'precomp.make',layers:ids,name:p.name,id});clearLayerSet();animationSession().setView({selectedLayer:id,selectedKey:null});},
   object({layers:{type:'array',items:layerRef,minItems:1,maxItems:200},name:{type:'string',minLength:1,maxLength:200}},[]),()=>open()&&layerSetIds(animationSession().getState().view.selectedLayer).length>0,'Edit'),
  spec('animation.precomp.time','Set comp layer speed, volume, loop and start',(p:{layer?:string;speed?:number;volume?:number;loop?:boolean;offset?:number})=>{const layer=p.layer??selected();const l=findLayer(comp(),layer);if(l?.kind!=='comp')fail('Select a comp layer.');
   if(p.volume!==undefined&&l?.gain?.keys.length){if(p.speed!==undefined||p.loop!==undefined||p.offset!==undefined)fail('Set the animated volume on its own.');return run({type:'layer.gain.set',layer,value:p.volume,t:playhead()});}
   const source={...(p.speed!==undefined?{speed:p.speed}:{}),...(p.volume!==undefined?{volume:p.volume}:{}),...(p.loop!==undefined?{loop:p.loop}:{}),...(p.offset!==undefined?{timeOffset:Math.max(0,secondsToTicks(p.offset))}:{})};if(!Object.keys(source).length)fail('Nothing to change.');return run({type:'layer.update',layer,source});},
   object({layer:layerRef,speed:{type:'number',minimum:10,maximum:1000},volume:{type:'number',minimum:0,maximum:200},loop:{type:'boolean'},offset:{type:'number',minimum:0,maximum:3600}},[]),()=>open()&&findLayer(comp(),animationSession().getState().view.selectedLayer??'')?.kind==='comp','Edit'),
  spec('animation.precomp.volume.animate','Toggle comp layer volume keyframes',(p:{layer?:string;on:boolean})=>{const layer=p.layer??selected();if(findLayer(comp(),layer)?.kind!=='comp')fail('Select a comp layer.');return run({type:'layer.gain.animate',layer,on:p.on,t:playhead()});},
   object({layer:layerRef,on:{type:'boolean'}},['on']),()=>open()&&findLayer(comp(),animationSession().getState().view.selectedLayer??'')?.kind==='comp','Edit'),
  spec('animation.precomp.volume.keyRemove','Remove comp layer volume keyframe',(p:{layer?:string;t?:number})=>{const layer=p.layer??selected();if(findLayer(comp(),layer)?.kind!=='comp')fail('Select a comp layer.');return run({type:'layer.gain.key.remove',layer,t:p.t??playhead()});},
   object({layer:layerRef,t:tick},[]),()=>open()&&!!findLayer(comp(),animationSession().getState().view.selectedLayer??'')?.gain?.keys.length,'Edit'),
  spec('animation.stroke.animate','Toggle stroke width or opacity keyframes',(p:{layer?:string;prop:'width'|'opacity';on:boolean})=>run({type:'stroke.prop',layer:layerIdOf(p),prop:p.prop,op:'animate',on:p.on,t:playhead()}),object({layer:layerRef,prop:{enum:['width','opacity']},on:{type:'boolean'}},['prop','on'])),
  spec('animation.stroke.keyRemove','Remove stroke width or opacity keyframe',(p:{layer?:string;prop:'width'|'opacity';t?:number})=>run({type:'stroke.prop',layer:layerIdOf(p),prop:p.prop,op:'remove',t:p.t??playhead()}),object({layer:layerRef,prop:{enum:['width','opacity']},t:tick},['prop'])),
  spec('animation.color.animate','Toggle fill or stroke colour keyframes',(p:{layer?:string;prop:'fill'|'stroke';on:boolean})=>run({type:'color.prop',layer:layerIdOf(p),prop:p.prop,op:'animate',on:p.on,t:playhead()}),object({layer:layerRef,prop:{enum:['fill','stroke']},on:{type:'boolean'}},['prop','on'])),
  spec('animation.color.keyRemove','Remove fill or stroke colour keyframe',(p:{layer?:string;prop:'fill'|'stroke';t?:number})=>run({type:'color.prop',layer:layerIdOf(p),prop:p.prop,op:'remove',t:p.t??playhead()}),object({layer:layerRef,prop:{enum:['fill','stroke']},t:tick},['prop'])),
  spec('animation.color.ease','Set ease of the fill or stroke colour key at the playhead',(p:{layer?:string;prop:'fill'|'stroke';t?:number;preset:EasePreset})=>{if(!(COLOR_EASES as readonly string[]).includes(p.preset))fail('Unknown ease preset.');return run({type:'color.ease',layer:layerIdOf(p),prop:p.prop,t:p.t??playhead(),ease:p.preset as ColorEase});},
   object({layer:layerRef,prop:{enum:['fill','stroke']},t:tick,preset:{enum:[...COLOR_EASES]}},['prop','preset'])),
  spec('animation.styleKeys.delete','Delete the selected style-lane keyframes',()=>{const v=animationSession().getState().view,picks=pruneStyleKeys(comp().layers,v.styleKeys);if(!picks.length)fail('Select style keys first.');
   const layer=picks[0].layer;const rev=run(styleKeyDeleteEdits(layer,picks.filter(p=>p.layer===layer)));animationSession().setView({styleKeys:[]});return rev;},
   undefined,()=>open()&&pruneStyleKeys(comp().layers,animationSession().getState().view.styleKeys).length>0,'Edit'),
  spec('animation.styleKeys.nudge','Move the selected style-lane keyframes by frames',(p:{frames:number})=>{const v=animationSession().getState().view,c=comp(),picks=pruneStyleKeys(c.layers,v.styleKeys);if(!picks.length)fail('Select style keys first.');
   if(!Number.isInteger(p.frames)||p.frames===0||Math.abs(p.frames)>600)fail('Frames must be a non-zero whole number up to 600.');
   const layer=picks[0].layer,mine=picks.filter(x=>x.layer===layer),delta=p.frames*frameToTick(1,c.fps);
   const rev=run(styleKeyShiftEdits(layer,mine,delta));animationSession().setView({styleKeys:mine.map(x=>({...x,t:x.t+delta})),playhead:mine[mine.length-1].t+delta});return rev;},
   object({frames:{type:'integer',minimum:-600,maximum:600}},['frames']),()=>open()&&pruneStyleKeys(comp().layers,animationSession().getState().view.styleKeys).length>0,'Edit'),
  spec('animation.blur.layers','Toggle motion blur on layers',(p:{layers?:string[];enabled?:boolean})=>{const ids=p.layers??layerSetIds(animationSession().getState().view.selectedLayer);if(!ids.length)fail('Select a layer first.');
   const enabled=p.enabled??!ids.every(id=>findLayer(comp(),id)?.motionBlur);return run({type:'layer.motionBlur',layers:ids,enabled});},
   object({layers:{type:'array',items:layerRef,minItems:1,maxItems:200},enabled:{type:'boolean'}},[]),()=>open()&&layerSetIds(animationSession().getState().view.selectedLayer).length>0,'Edit'),
  spec('animation.blur.comp','Set composition motion blur (shutter)',(p:{enabled?:boolean;angle?:number;samples?:number})=>{const cur=comp().shutter;
   const shutter=p.enabled===false?null:{angle:p.angle??cur?.angle??180,samples:p.samples??cur?.samples??8};return run({type:'comp.shutter',shutter});},
   object({enabled:{type:'boolean'},angle:{type:'number',minimum:1,maximum:720},samples:{type:'integer',minimum:2,maximum:16}},[]),open,'Edit'),
  spec('animation.precomp.add','Add a composition as a layer',(p:{comp:string})=>{run({type:'precomp.add',comp:p.comp});animationSession().setView({selectedLayer:comp().layers[0]?.id??null});},object({comp:{type:'string',minLength:1,maxLength:64}},['comp']),()=>open()&&doc().compositions.length>1,'Insert'),
  spec('animation.layer.remove','Delete layer',(p:{layer?:string})=>{run({type:'layer.remove',layer:layerIdOf(p)});animationSession().setView({selectedLayer:null,selectedKey:null});},object({layer:layerRef},[])),
  spec('animation.layer.update','Edit layer',(p:{layer?:string;name?:string;visible?:boolean;solo?:boolean;locked?:boolean;shy?:boolean;text?:string;size?:number;color?:string;font?:TextFont})=>{
   const {layer,text,size,color,font,...flags}=p;const source={...(text!==undefined?{text}:{}),...(size!==undefined?{size}:{}),...(color!==undefined?{color}:{}),...(font!==undefined?{font}:{})};
   return run({type:'layer.update',layer:layer??selected(),...flags,...(Object.keys(source).length?{source}:{})});},
   object({layer:layerRef,name:{type:'string',maxLength:200},visible:{type:'boolean'},solo:{type:'boolean'},locked:{type:'boolean'},shy:{type:'boolean'},text:{type:'string',maxLength:2000},size:{type:'number',minimum:1,maximum:2000},color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},font:{enum:Object.keys(TEXT_FONTS)}},[])),
  spec('animation.audio.import','Import audio (WAV or MP3)',()=>{window.dispatchEvent(new CustomEvent(AUDIO_IMPORT_EVENT));},undefined,open,'Insert'),
  spec('animation.audio.update','Trim and place audio clip',(p:{layer?:string;trimIn?:number;length?:number;offset?:number})=>run({type:'audio.update',layer:layerIdOf(p),...(p.trimIn!==undefined?{trimIn:secondsToTicks(p.trimIn)}:{}),...(p.length!==undefined?{length:secondsToTicks(p.length)}:{}),...(p.offset!==undefined?{offset:secondsToTicks(p.offset)}:{})}),object({layer:layerRef,trimIn:{type:'number',minimum:0,maximum:600},length:{type:'number',minimum:0.001,maximum:600},offset:{type:'number',minimum:-3600,maximum:3600}},[])),
  spec('animation.audio.beats','Find beats in the audio clip and mark them',(p:{layer?:string;sensitivity?:number;clear?:boolean})=>{
   const c=comp();const marks=c.markers??[];
   if(p.clear){const keep=marks.filter(m=>!BEAT_LABEL.test(m.label));if(keep.length===marks.length)throw Object.assign(Error('There are no beat markers.'),{expected:true});run({type:'markers.set',markers:keep});return 0;}
   const l=findLayer(c,layerIdOf(p));if(!l||l.kind!=='audio'||!l.audio)throw Object.assign(Error('Select an audio layer.'),{expected:true});
   const asset=doc().audioAssets?.find(a=>a.id===l.audio!.assetId);if(!asset)throw Object.assign(Error('The audio file is missing.'),{expected:true});
   const beats=detectBeats(asset.peaks,asset.durationTicks,{sensitivity:p.sensitivity});
   const made=beatMarkers(beats,{trimIn:l.audio.trimIn,length:l.outT-l.inT,start:l.inT+l.offset},marks,c.start,c.start+c.duration,t=>snapToFrame(t,c.fps),()=>newId('marker'));
   if(!made.length)throw Object.assign(Error('No new beats found in this clip. Try a higher sensitivity.'),{expected:true});
   run({type:'markers.set',markers:[...marks,...made]});return made.length;
  },object({layer:layerRef,sensitivity:{type:'integer',minimum:1,maximum:10},clear:{type:'boolean'}},[]),()=>open()&&findLayer(comp(),selected())?.kind==='audio','Edit'),
  spec('animation.audio.reactive','Make a layer follow the loudness of the audio clip',(p:{layer?:string;target:string;prop:ReactiveProp;min:number;max:number;smooth?:number})=>{
   const c=comp();const l=findLayer(c,layerIdOf(p));if(!l||l.kind!=='audio'||!l.audio)throw Object.assign(Error('Select an audio layer.'),{expected:true});
   const asset=doc().audioAssets?.find(a=>a.id===l.audio!.assetId);if(!asset)throw Object.assign(Error('The audio file is missing.'),{expected:true});
   const target=findLayer(c,p.target);if(!target||target.kind==='audio')throw Object.assign(Error('Pick a layer to animate.'),{expected:true});
   const keys=reactiveKeys(asset.peaks,asset.durationTicks,l,{min:p.min,max:p.max,smooth:p.smooth,from:c.start,to:c.start+c.duration,stepTicks:frameToTick(2,c.fps),snap:t=>snapToFrame(t,c.fps)});
   if(keys.length<2)throw Object.assign(Error('This clip is silent or outside the composition.'),{expected:true});
   run({type:'audio.reactive',layer:target.id,prop:p.prop,keys});return keys.length;
  },object({layer:layerRef,target:layerRef,prop:{enum:[...REACTIVE_PROPS]},min:{type:'number'},max:{type:'number'},smooth:{type:'number',minimum:0,maximum:MAX_SMOOTH}},['target','prop','min','max']),()=>open()&&findLayer(comp(),selected())?.kind==='audio','Edit'),
  spec('animation.template.save','Save the selected layer as a template',(p:{layer?:string;name?:string})=>{
   const d=doc();const set=p.layer?[p.layer]:layerSetIds(animationSession().getState().view.selectedLayer);const t=buildTemplate(d,set.length?set:layerIdOf(p),p.name,newId('tpl'));
   run({type:'layerTemplates.set',items:[...layerTemplates(d),t]});return t.name;
  },object({layer:layerRef,name:{type:'string',minLength:1,maxLength:40}},[]),()=>open()&&!!animationSession().getState().view.selectedLayer,'Insert'),
  spec('animation.template.delete','Delete a saved template',(p:{id:string})=>{
   const d=doc();const items=layerTemplates(d);if(!items.some(x=>x.id===p.id))throw Object.assign(Error('That template no longer exists.'),{expected:true});
   run({type:'layerTemplates.set',items:items.filter(x=>x.id!==p.id)});
  },object({id:{type:'string',minLength:1,maxLength:64}}),()=>open()&&layerTemplates(animationSession().document).length>0,'Insert'),
  spec('animation.template.add','Add a starter template',(p:{template?:TemplateId;saved?:string;at?:number})=>{
   if(p.saved!==undefined){const at=p.at!==undefined?secondsToTicks(p.at):animationSession().getState().view.playhead,id=newId('layer');
    const tp=layerTemplates(doc()).find(x=>x.id===p.saved);const more=Array.from({length:Math.max(0,(tp?1+(tp.extra?.length??0):1)-1)},()=>newId('layer'));
    run({type:'layerTemplate.insert',template:p.saved,layer:id,at:snapToFrame(at,comp().fps),...(more.length?{layers:more}:{})});animationSession().setView({selectedLayer:id});return;}
   if(!p.template)throw Object.assign(Error('Pick a template.'),{expected:true});
   const c=comp();const ids=Array.from({length:TEMPLATE_LAYERS[p.template]??0},()=>newId('layer'));
   run(templateEdits(c,p.template,p.at!==undefined?secondsToTicks(p.at):animationSession().getState().view.playhead,ids));
   animationSession().setView({selectedLayer:ids[0]});
  },object({template:{enum:[...TEMPLATE_IDS]},saved:{type:'string',minLength:1,maxLength:64},at:{type:'number',minimum:0}},[]),open,'Insert'),
  spec('animation.layer.nudge','Nudge the selected layer',(p:{dx?:number;dy?:number})=>{
   const c=comp(),l=findLayer(c,selected())!;if(l.locked)throw Object.assign(Error('That layer is locked.'),{expected:true});
   const at=animationSession().getState().view.playhead,cur=evaluate(l.transform.position,at) as readonly number[],d=toParentDelta(c,l,at,[p.dx??0,p.dy??0]);
   run({type:'prop.set',layer:l.id,prop:'position',t:at,value:[Math.round((cur[0]+d[0])*100)/100,Math.round((cur[1]+d[1])*100)/100]});
  },object({dx:{type:'number',minimum:-1000,maximum:1000},dy:{type:'number',minimum:-1000,maximum:1000}},[]),()=>{if(!open())return false;const id=animationSession().getState().view.selectedLayer,l=id?findLayer(comp(),id):undefined;return !!l&&!l.locked;},'Edit'),
  spec('animation.guides.overlay','Show or hide a viewer overlay',(p:{overlay:OverlayKey;on?:boolean})=>{
   const cur=normalizeOverlays(animationSession().getState().view.overlays);animationSession().setView({overlays:{...cur,[p.overlay]:p.on??!cur[p.overlay]}});
  },object({overlay:{enum:[...OVERLAY_KEYS]},on:{type:'boolean'}},['overlay']),open,'View'),
  spec('animation.guides.add','Add a ruler guide',(p:{axis:'x'|'y';at:number})=>{
   const g=comp().guides??[];if(g.some(x=>x.axis===p.axis&&x.at===p.at))throw Object.assign(Error('That guide already exists.'),{expected:true});
   run({type:'guides.set',guides:addGuide(g,{axis:p.axis,at:Math.round(p.at*100)/100})});
  },object({axis:{enum:['x','y']},at:{type:'number',minimum:0}}),open,'View'),
  spec('animation.guides.remove','Remove a ruler guide',(p:{index?:number;all?:boolean})=>{
   const g=comp().guides??[];if(!g.length)throw Object.assign(Error('There are no guides.'),{expected:true});
   if(p.all){run({type:'guides.set',guides:[]});return;}
   if(p.index===undefined||!g[p.index])throw Object.assign(Error('That guide no longer exists.'),{expected:true});
   run({type:'guides.set',guides:g.filter((_,i)=>i!==p.index)});
  },object({index:{type:'integer',minimum:0},all:{type:'boolean'}},[]),()=>open()&&!!comp().guides?.length,'View'),
  spec('animation.audio.grid','Place beat markers on a steady BPM grid',(p:{layer?:string;bpm?:number;sensitivity?:number})=>{
   const c=comp();const l=findLayer(c,layerIdOf(p));if(!l||l.kind!=='audio'||!l.audio)throw Object.assign(Error('Select an audio layer.'),{expected:true});
   const asset=doc().audioAssets?.find(a=>a.id===l.audio!.assetId);if(!asset)throw Object.assign(Error('The audio file is missing.'),{expected:true});
   const beats=detectBeats(asset.peaks,asset.durationTicks,{sensitivity:p.sensitivity}).filter(b=>b>=l.audio!.trimIn&&b<l.audio!.trimIn+(l.outT-l.inT));
   if(!beats.length)throw Object.assign(Error('No beats found in this clip. Try a higher sensitivity.'),{expected:true});
   const bpm=p.bpm??estimateBpm(beats);if(!bpm)throw Object.assign(Error('No steady tempo found. Enter a tempo.'),{expected:true});
   const keep=(c.markers??[]).filter(m=>!BEAT_LABEL.test(m.label));
   const grid=gridTicks(beats[0],bpm,l.audio.trimIn,l.audio.trimIn+(l.outT-l.inT));
   const made=beatMarkers(grid,{trimIn:l.audio.trimIn,length:l.outT-l.inT,start:l.inT+l.offset},keep,c.start,c.start+c.duration,t=>snapToFrame(t,c.fps),()=>newId('marker'));
   if(!made.length)throw Object.assign(Error('The grid does not fit the composition.'),{expected:true});
   run({type:'markers.set',markers:[...keep,...made]});return bpm;
  },object({layer:layerRef,bpm:{type:'number',minimum:30,maximum:300},sensitivity:{type:'integer',minimum:1,maximum:10}},[]),()=>open()&&findLayer(comp(),selected())?.kind==='audio','Edit'),
  spec('animation.keys.quantize','Snap selected keys to the nearest marker',(p:{maxSeconds?:number}={})=>{
   const c=comp();const keys=selKeys();const marks=(c.markers??[]).map(m=>m.t);if(!marks.length)throw Object.assign(Error('Add markers first, for example with Find beats.'),{expected:true});
   const r=quantizeMoves(c,keys,marks,p.maxSeconds!==undefined?secondsToTicks(p.maxSeconds):Infinity);
   if(!r.moves.length)throw Object.assign(Error(r.skipped?'Keys would collide at the markers.':'The keys are already on markers.'),{expected:true});
   run({type:'keys.retime',moves:r.moves});
   const to=new Map(r.moves.map(m=>[`${m.layer}\0${m.prop}\0${m.from}`,m.to]));
   animationSession().selectKeys(keys.map(k=>({...k,t:to.get(`${k.layer}\0${k.prop}\0${k.t}`)??k.t})));return r.moves.length;
  },object({maxSeconds:{type:'number',minimum:0,maximum:60}},[]),hasSel,'Edit'),
  spec('animation.audio.volume.set','Set audio volume (percent)',(p:{layer?:string;value:number;t?:number})=>run({type:'audio.volume.set',layer:layerIdOf(p),value:p.value,t:p.t??playhead()}),object({layer:layerRef,value:{type:'number',minimum:0,maximum:200},t:tick},['value'])),
  spec('animation.audio.volume.animate','Toggle audio volume keyframes',(p:{layer?:string;on:boolean})=>run({type:'audio.volume.animate',layer:layerIdOf(p),on:p.on,t:playhead()}),object({layer:layerRef,on:{type:'boolean'}},['on'])),
  spec('animation.audio.volume.keyRemove','Remove audio volume keyframe',(p:{layer?:string;t?:number})=>run({type:'audio.volume.key.remove',layer:layerIdOf(p),t:p.t??playhead()}),object({layer:layerRef,t:tick},[])),
  spec('animation.project.saveLocal','Save local animation snapshot',()=>saveAnimationSnapshot(),undefined,open,'Project'),
  spec('animation.preset.apply','Apply entrance preset',(p:{layer?:string;preset:MotionPreset;seconds?:number})=>run(presetEdits(doc(),layerIdOf(p),p.preset,playhead(),p.seconds)),object({layer:layerRef,preset:{enum:['fade','slide','bounce','typewriter','trim','dash']},seconds:{type:'number',minimum:0.1,maximum:30}},['preset'])),
  spec('animation.marker.add','Add timing marker',(p:{label?:string}={})=>run({type:'markers.set',markers:[...(comp().markers??[]),{id:newId('marker'),t:playhead(),label:p.label??'Marker'}]}),object({label:{type:'string',maxLength:100}},[])),
  spec('animation.marker.remove','Remove timing marker',(p:{id:string})=>run({type:'markers.set',markers:(comp().markers??[]).filter(m=>m.id!==p.id)}),object({id:layerRef})),
  spec('animation.effect.colorKey','Set tint colour key',(p:{layer?:string;effect:string;color:string;t?:number})=>run({type:'effect.colorKey',layer:layerIdOf(p),effect:p.effect,color:p.color,t:p.t??playhead()}),object({layer:layerRef,effect:layerRef,color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},t:tick},['effect','color'])),
  spec('animation.effect.bypassKey','Set effect bypass key',(p:{layer?:string;effect:string;bypass:boolean;t?:number})=>run({type:'effect.bypassKey',layer:layerIdOf(p),effect:p.effect,bypass:p.bypass,t:p.t??playhead()}),object({layer:layerRef,effect:layerRef,bypass:{type:'boolean'},t:tick},['effect','bypass'])),
  spec('animation.effect.style','Set shadow or glow blur, distance and angle',(p:{layer?:string;effect:string;blur?:number;distance?:number;angle?:number})=>run({type:'effect.style',layer:layerIdOf(p),effect:p.effect,blur:p.blur,distance:p.distance,angle:p.angle}),object({layer:layerRef,effect:layerRef,blur:{type:'number',minimum:0,maximum:64},distance:{type:'number',minimum:0,maximum:500},angle:{type:'number',minimum:-360,maximum:360}},['effect']),open,'Edit'),
  spec('animation.effect.amount','Set animated effect strength',(p:{layer?:string;effect:string;value:number;t?:number})=>run({type:'effect.amount',layer:layerIdOf(p),effect:p.effect,value:p.value,t:p.t??playhead()}),object({layer:layerRef,effect:layerRef,value:num,t:tick},['effect','value'])),
  spec('animation.effect.animate','Toggle effect animation',(p:{layer?:string;effect:string;on:boolean})=>run({type:'effect.animate',layer:layerIdOf(p),effect:p.effect,on:p.on,t:playhead()}),object({layer:layerRef,effect:layerRef,on:{type:'boolean'}},['effect','on'])),
  spec('animation.layer.effects','Set layer effects',(p:{layer?:string;effects:LayerEffect[]})=>run({type:'layer.effects',layer:layerIdOf(p),effects:p.effects}),object({layer:layerRef,effects:{type:'array',maxItems:8,items:object({id:layerRef,kind:{enum:['blur','tint','shadow','glow','innerShadow','innerGlow']},enabled:{type:'boolean'},amount:{type:'number',minimum:0,maximum:64},color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},blur:{type:'number',minimum:0,maximum:64},distance:{type:'number',minimum:0,maximum:500},angle:{type:'number',minimum:-360,maximum:360}})}},['effects'])),
  spec('animation.path.mode','Set position path timing',(p:{layer?:string;mode:'parameter'|'arcLength'})=>run({type:'prop.pathMode',layer:layerIdOf(p),mode:p.mode}),object({layer:layerRef,mode:{enum:['parameter','arcLength']}},['mode'])),
  spec('animation.key.channelEase','Set X or Y ease',(p:{layer?:string;prop:TransformKey;t?:number;channel:0|1;out?:[number,number];in?:[number,number]})=>run({type:'key.interp',layer:layerIdOf(p),prop:p.prop,t:p.t??playhead(),channel:p.channel,interp:'bezier',out:p.out,in:p.in}),object({layer:layerRef,prop:propKey,t:tick,channel:{enum:[0,1]},out:{type:'array',items:num,minItems:2,maxItems:2},in:{type:'array',items:num,minItems:2,maxItems:2}},['prop','channel'])),
  spec('animation.layer.timing','Set layer in and out',(p:{layer?:string;inT:number;outT:number})=>run({type:'layer.timing',layer:layerIdOf(p),inT:p.inT,outT:p.outT}),object({layer:layerRef,inT:tick,outT:tick},['inT','outT'])),
  spec('animation.layer.parent','Set layer parent',(p:{layer?:string;parent:string|null;keepWorld?:boolean})=>run({type:'layer.parent',layer:layerIdOf(p),parent:p.parent,keepWorld:p.keepWorld,t:playhead()}),{type:'object',properties:{layer:layerRef,parent:{type:['string','null']},keepWorld:{type:'boolean'}},required:['parent'],additionalProperties:false}),
  spec('animation.text.path','Put text on a path, move its start or take it off',(p:{layer?:string;op:string;from?:string;value?:number})=>{const {layer:_l,...op}=p;return run(textPathEdit(doc(),layerIdOf(p),op as TextPathOp));},{type:'object',properties:{layer:layerRef,op:{enum:['set','clear','start']},from:layerRef,value:{type:'number',minimum:0,maximum:100}},required:['op'],additionalProperties:false},open,'Insert'),
  spec('animation.text.animator','Edit a per-character text animator',(p:{layer?:string}&AnimatorOp)=>{const {layer:_l,...op}=p;const ops={...op,...('t' in op?{t:op.t??playhead()}:{})} as AnimatorOp;return run(animatorEdit(doc(),layerIdOf(p),ops));},{type:'object',properties:{layer:layerRef,op:{enum:['add','remove','update','offset','animate','stagger','preset']},preset:{enum:['rise','pop','spin','fade','typewriter']},id:layerRef,animator:layerRef,patch:object({enabled:{type:'boolean'},start:{type:'number',minimum:0,maximum:100},end:{type:'number',minimum:0,maximum:100},softness:{type:'number',minimum:0,maximum:100},position:{type:'array',items:{type:'number',minimum:-2000,maximum:2000},minItems:2,maxItems:2},scale:{type:'number',minimum:0,maximum:1000},opacity:{type:'number',minimum:0,maximum:100},rotation:{type:'number',minimum:-3600,maximum:3600},color:{type:['string','null'],pattern:'^#[0-9a-fA-F]{6}$'},unit:{enum:['char','word']},tracking:{type:'number',minimum:-200,maximum:200},ease:{enum:['linear','smooth','in','out']}},[]),value:{type:'number',minimum:-100,maximum:100},on:{type:'boolean'},t:tick,seconds:{type:'number',minimum:0.1,maximum:30},mode:{enum:['wave','reveal']}},required:['op'],additionalProperties:false}),
  spec('animation.text.preset.save','Save a text animator as a preset',(p:{name:string;layer?:string;animator?:string})=>{
   const id=layerIdOf(p);const l=findLayer(comp(),id);const aid=p.animator??l?.animators?.[0]?.id;if(!aid)throw Object.assign(Error('Add a text animator first.'),{expected:true});
   try{const r=saveTextPresetEdit(doc(),id,aid,p.name);run(r.edit);return r.preset.id;}catch(e){throw Object.assign(e as Error,{expected:true});}
  },object({name:{type:'string',minLength:1,maxLength:40},layer:layerRef,animator:layerRef},['name']),()=>open()&&!!findLayer(comp(),selected())?.animators?.length,'Edit'),
  spec('animation.text.preset.apply','Apply a saved text animator preset',(p:{preset:string;layer?:string})=>{
   const set=userTextPresets(doc()).find(m=>m.id===p.preset)??fail('Unknown text preset.');
   try{run(applyTextPresetEdit(doc(),layerIdOf(p),set,playhead()));}catch(e){throw Object.assign(e as Error,{expected:true});}
  },object({preset:{type:'string',minLength:1,maxLength:64},layer:layerRef},['preset']),()=>open()&&findLayer(comp(),selected())?.kind==='text','Edit'),
  spec('animation.text.preset.delete','Delete a saved text animator preset',(p:{preset:string})=>{try{run(deleteTextPresetEdit(doc(),p.preset));}catch(e){throw Object.assign(e as Error,{expected:true});}},object({preset:{type:'string',minLength:1,maxLength:64}}),()=>open()&&userTextPresets(animationSession().document).length>0,'Edit'),
  spec('animation.layer.mask','Edit a layer mask',(p:{layer?:string}&MaskOp)=>{const {layer:_l,...op}=p;const o=op as {op:string;t?:number};const withT=o.op==='set'||o.op==='animate'||o.op==='box'||o.op==='pathAnimate'||o.op==='morphTo'||o.op==='keyPaste'||o.op==='keysPaste'||o.op==='point'||o.op==='handle'?{...op,t:o.t??playhead()}:op;return run(maskEdit(doc(),layerIdOf(p),withT as MaskOp));},{type:'object',properties:{layer:layerRef,op:{enum:['add','remove','update','set','animate','path','keyMove','keyRemove','keyEase','box','point','pen','close','handle','pathAnimate','morphTo','pointRemove','pointInsert','adopt','keyPaste','keyEdit','keyHandle','keysEdit','keysEase','keysPaste']},edits:{type:'array',maxItems:2000,items:{type:'object'}},ts:{type:'array',maxItems:2000,items:tick},kind:{enum:['in','out']},source:{type:'object'},clip:{type:'object'},which:{enum:['in','out']},mirror:{type:'boolean'},restart:{type:'boolean'},outX:{type:'number',minimum:-16384,maximum:16384},outY:{type:'number',minimum:-16384,maximum:16384},id:layerRef,mask:layerRef,other:layerRef,match:{enum:['index','resample']},reverse:{type:'boolean'},shift:{type:'integer',minimum:0,maximum:31},from:tick,to:tick,preset:{enum:['linear','hold','ease','easeIn','easeOut']},index:{type:'integer',minimum:0,maximum:31},x:{type:'number',minimum:-16384,maximum:16384},y:{type:'number',minimum:-16384,maximum:16384},width:{type:'number',minimum:1,maximum:16384},height:{type:'number',minimum:1,maximum:16384},prop:{enum:['position','size','feather','opacity','path']},value,on:{type:'boolean'},t:tick,points:{type:'array',items:object({x:{type:'number',minimum:-16384,maximum:16384},y:{type:'number',minimum:-16384,maximum:16384}}),minItems:2,maxItems:32},closed:{type:'boolean'},smooth:{type:'boolean'},patch:object({shape:{enum:['rect','ellipse','path']},mode:{enum:['add','subtract']},x:{type:'number',minimum:-16384,maximum:16384},y:{type:'number',minimum:-16384,maximum:16384},width:{type:'number',minimum:1,maximum:16384},height:{type:'number',minimum:1,maximum:16384},feather:{type:'number',minimum:0,maximum:64},invert:{type:'boolean'},opacity:{type:'number',minimum:0,maximum:100}},[])},required:['op'],additionalProperties:false}),
  spec('animation.layer.path','Edit a path shape layer',(p:{layer?:string}&PathLayerOp)=>{const {layer:_l,...op}=p;const o=op as {op:string;t?:number};const withT=o.op==='animate'||o.op==='point'||o.op==='handle'||o.op==='movePoints'||o.op==='segment'?{...op,t:o.t??playhead()}:o.op==='morphTo'?{...op,t:o.t??playhead()}:op;return run(pathLayerEdit(doc(),layerIdOf(p),withT as PathLayerOp));},{type:'object',properties:{layer:layerRef,op:{enum:['points','animate','point','pen','close','addSubpath','removeSubpath','insert','remove','corner','movePoints','removePoints','cornerPoints','segment','handle','morphTo']},u:{type:'number',minimum:0,maximum:1},indices:{type:'array',maxItems:256,items:{type:'integer',minimum:0,maximum:255}},dx:{type:'number',minimum:-2,maximum:2},dy:{type:'number',minimum:-2,maximum:2},smooth:{type:'boolean'},path:{type:'object'},outX:{type:'number',minimum:-2,maximum:2},outY:{type:'number',minimum:-2,maximum:2},which:{enum:['in','out']},mirror:{type:'boolean'},on:{type:'boolean'},index:{type:'integer',minimum:0,maximum:255},x:{type:'number',minimum:-2,maximum:2},y:{type:'number',minimum:-2,maximum:2},t:tick,other:layerRef,opts:{type:'object'}},required:['op'],additionalProperties:false}),
  spec('animation.mask.toLayer','Turn a path mask into a shape layer',(p:{layer?:string;mask:string})=>{const id=newId('layer');run(maskToLayerEdit(doc(),layerIdOf(p),p.mask,id));animationSession().setView({selectedLayer:id});},object({layer:layerRef,mask:layerRef},['mask'])),
  spec('animation.layer.matte','Set layer track matte',(p:{layer?:string;source:string|null;mode?:'alpha'|'luma';invert?:boolean})=>run(matteEdit(doc(),layerIdOf(p),p.source,p.mode,p.invert)),{type:'object',properties:{layer:layerRef,source:{type:['string','null']},mode:{enum:['alpha','luma']},invert:{type:'boolean'}},required:['source'],additionalProperties:false}),
  spec('animation.layer.reorder','Reorder layer',(p:{layer?:string;index:number})=>run({type:'layer.reorder',layer:layerIdOf(p),index:p.index}),object({layer:layerRef,index:{type:'integer',minimum:0}},['index'])),
  spec('animation.prop.set','Set property value',(p:{layer?:string;prop:TransformKey;value:PropValue;t?:number})=>run({type:'prop.set',layer:layerIdOf(p),prop:p.prop,value:p.value,t:p.t??playhead()}),object({layer:layerRef,prop:propKey,value,t:tick},['prop','value'])),
  spec('animation.prop.animate','Toggle property animation',(p:{layer?:string;prop:TransformKey;on:boolean})=>run({type:'prop.animate',layer:layerIdOf(p),prop:p.prop,on:p.on,t:playhead()}),object({layer:layerRef,prop:propKey,on:{type:'boolean'}},['prop','on'])),
  spec('animation.key.add','Add keyframe at playhead',(p:{layer?:string;prop:TransformKey;t?:number})=>run({type:'key.add',layer:layerIdOf(p),prop:p.prop,t:p.t??playhead()}),object({layer:layerRef,prop:propKey,t:tick},['prop'])),
  spec('animation.key.remove','Remove keyframe',(p:{layer?:string;prop:TransformKey;t?:number})=>run({type:'key.remove',layer:layerIdOf(p),prop:p.prop,t:p.t??playhead()}),object({layer:layerRef,prop:propKey,t:tick},['prop'])),
  spec('animation.key.move','Move keyframe',(p:{layer?:string;prop:TransformKey;from:number;to:number;replace?:boolean})=>run({type:'key.move',layer:layerIdOf(p),prop:p.prop,from:p.from,to:p.to,replace:p.replace}),object({layer:layerRef,prop:propKey,from:tick,to:tick,replace:{type:'boolean'}},['prop','from','to'])),
  spec('animation.key.interp','Set keyframe interpolation',(p:{layer?:string;prop:TransformKey;t?:number;interp:'hold'|'linear'|'bezier'})=>run({type:'key.interp',layer:layerIdOf(p),prop:p.prop,t:p.t??playhead(),interp:p.interp}),object({layer:layerRef,prop:propKey,t:tick,interp:{enum:['hold','linear','bezier']}},['prop','interp'])),
  spec('animation.modifier.add','Add a wiggle, loop or link modifier to a property',(p:{layer?:string;prop:TransformKey;modifier:Modifier})=>run({type:'modifier.add',layer:layerIdOf(p),prop:p.prop,modifier:p.modifier}),object({layer:layerRef,prop:propKey,modifier:modifierSchema},['prop','modifier'])),
  spec('animation.modifier.set','Change a wiggle, loop or link modifier',(p:{layer?:string;prop:TransformKey;index:number;modifier:Modifier})=>run({type:'modifier.set',layer:layerIdOf(p),prop:p.prop,index:p.index,modifier:p.modifier}),object({layer:layerRef,prop:propKey,index:{type:'integer',minimum:0},modifier:modifierSchema},['prop','index','modifier'])),
  spec('animation.modifier.link','Link a property to another layer\'s property',(p:{layer?:string;prop:TransformKey;from:string;fromProp?:TransformKey;multiplier?:number;offset?:number})=>run({type:'modifier.add',layer:layerIdOf(p),prop:p.prop,modifier:{type:'link',layer:p.from,prop:p.fromProp??p.prop,multiplier:p.multiplier??1,offset:p.offset??0}}),object({layer:layerRef,prop:propKey,from:layerRef,fromProp:propKey,multiplier:{type:'number',minimum:-1000,maximum:1000},offset:{type:'number',minimum:-100000,maximum:100000}},['prop','from'])),
  spec('animation.modifier.remove','Remove a modifier from a property',(p:{layer?:string;prop:TransformKey;index:number})=>run({type:'modifier.remove',layer:layerIdOf(p),prop:p.prop,index:p.index}),object({layer:layerRef,prop:propKey,index:{type:'number'}},['prop','index'])),
  spec('animation.key.ease','Set ease of the key at the playhead',(p:{layer?:string;prop:TransformKey;t?:number;preset:EasePreset})=>{const e=EASE_PRESETS[p.preset]??fail('Unknown ease preset.');return run({type:'key.interp',layer:layerIdOf(p),prop:p.prop,t:p.t??playhead(),interp:e.interp,...('out' in e?{out:e.out,in:e.in}:{})});},object({layer:layerRef,prop:propKey,t:tick,preset:{enum:Object.keys(EASE_PRESETS)}},['prop','preset'])),
  spec('animation.keys.easeAll','Ease all selected keys (all keys of the layer when none are selected)',(p:{preset?:EasePreset}={})=>{
   const preset=p.preset??'ease';const layerId=selected();const keys=pruneSelection(doc(),animationSession().getState().view.selectedKeys);
   const layer=findLayer(comp(),layerId)!;const refs=keys.length?keys.map(k=>({target:{kind:'transform',prop:k.prop} as const,t:k.t,layer:k.layer})):allTargetKeys(layer).map(r=>({...r,layer:layerId}));
   if(!refs.length)fail('No keys to ease.');
   const byLayer=[...new Set(refs.map(r=>r.layer))];
   return run(byLayer.flatMap(id=>guard(()=>easeTargetKeys(doc(),id,refs.filter(r=>r.layer===id),preset))));
  },object({preset:{enum:Object.keys(EASE_PRESETS)}},[]),()=>open()&&!!animationSession().getState().view.selectedLayer,'Edit','Mod+Alt+E'),
  spec('animation.keys.bounce','Bake a bounce between the selected neighbouring keys',(p:{bounces?:number}={})=>{
   const layerId=selected();const keys=selKeys().filter(k=>k.layer===layerId);
   return run(guard(()=>{try{return bounceTargetKeys(doc(),layerId,keys.map(k=>({target:{kind:'transform' as const,prop:k.prop},t:k.t})),p.bounces??3);}catch(e){if(e instanceof Error&&!(e instanceof EditError))throw Object.assign(e,{expected:true});throw e;}}));
  },object({bounces:{type:'integer',minimum:1,maximum:5}},[]),hasSel,'Edit'),
  spec('animation.keys.elastic','Bake an elastic settle between the selected neighbouring keys',(p:{swings?:number}={})=>{
   const layerId=selected();const keys=selKeys().filter(k=>k.layer===layerId);
   return run(guard(()=>{try{return elasticTargetKeys(doc(),layerId,keys.map(k=>({target:{kind:'transform' as const,prop:k.prop},t:k.t})),p.swings??3);}catch(e){if(e instanceof Error&&!(e instanceof EditError))throw Object.assign(e,{expected:true});throw e;}}));
  },object({swings:{type:'integer',minimum:1,maximum:5}},[]),hasSel,'Edit'),
  spec('animation.keys.cubic','Set a custom cubic-bezier ease on the selected keys',(p:{out:[number,number];in:[number,number]})=>run({type:'keys.interp',keys:selKeys(),interp:'bezier',out:p.out,in:p.in}),
   object({out:handleSchema,in:handleSchema},['out','in']),hasSel,'Edit'),
  spec('animation.timeline.zoom','Zoom the timeline',(p:{mode:'in'|'out'|'fit'|'workarea';anchor?:number})=>{
   const c=comp();const v=animationSession().getState().view;const w=timeWindow(c,v.zoom,v.scroll);
   const next=p.mode==='fit'?fitAll():p.mode==='workarea'?fitRange(c,c.workArea.in,c.workArea.out):zoomAround(c,w,p.mode==='in'?2:0.5,p.anchor??v.playhead);
   animationSession().setView(next);
  },object({mode:{enum:['in','out','fit','workarea']},anchor:{type:'number'}},['mode']),open,'Project'),
  spec('animation.timeline.shy','Hide or show shy layers in the timeline',(p:{hide?:boolean}={})=>{setShyHidden(p.hide??!shyHidden());},object({hide:{type:'boolean'}},[]),open,'Project'),
  spec('animation.timeline.tracks','Collapse, expand or resize timeline tracks',(p:{mode:'collapse'|'expand'|'cycle'|'compact'|'normal'|'tall';layer?:string})=>{
   if(p.mode==='collapse'||p.mode==='expand'){setAllTracks(comp().layers.map(l=>l.id),p.mode);return;}
   const id=layerIdOf(p);setTrackHeight(id,p.mode==='cycle'?nextTrackHeight(trackHeightOf(id)):p.mode);
  },object({mode:{enum:['collapse','expand','cycle','compact','normal','tall']},layer:layerRef},['mode']),open,'View'),
  spec('animation.timeline.snap','Snap timeline drags to markers, work area and playhead',(p:{on?:boolean}={})=>{setTimelineSnap(p.on??!(timelineSnapNow()));},object({on:{type:'boolean'}},[]),open,'Project'),
  spec('animation.ease.copy','Copy the easing curve of the selected key',()=>{const ref=selKeys()[selKeys().length-1];guard(()=>copyCurve(findLayer(comp(),ref.layer)?.transform[ref.prop].keys.find(x=>x.t===ref.t)));},undefined,hasSel,'Edit'),
  spec('animation.ease.paste','Paste the copied easing curve onto the selected keys',()=>run(guard(()=>pasteCurveEdit(selKeys()))),undefined,hasSel,'Edit'),
  spec('animation.ease.save','Save a named easing in the document',(p:{name:string;out?:[number,number];in?:[number,number]})=>{
   try{let out=p.out,inn=p.in;if(!out||!inn){const ref=selKeys()[selKeys().length-1];const k=findLayer(comp(),ref.layer)!.transform[ref.prop].keys.find(x=>x.t===ref.t);if(!k||k.interp!=='bezier')fail('Select a key with a bezier ease.');out=k!.out as [number,number];inn=k!.in as [number,number];}
    return run(saveEasingEdit(doc(),p.name,out!,inn!));}catch(e){throw Object.assign(e as Error,{expected:true});}
  },object({name:{type:'string',minLength:1,maxLength:40},out:handleSchema,in:handleSchema},['name']),open,'Edit'),
  spec('animation.ease.apply','Apply a saved easing to the selected keys',(p:{ease:string})=>{const e=findEasing(doc(),p.ease)??fail('Unknown easing.');return run({type:'keys.interp',keys:selKeys(),interp:'bezier',out:e.out,in:e.in});},object({ease:{type:'string',minLength:1,maxLength:64}}),hasSel,'Edit'),
  spec('animation.ease.delete','Delete a saved easing',(p:{ease:string})=>{try{run(deleteEasingEdit(doc(),p.ease));}catch(e){throw Object.assign(e as Error,{expected:true});}},object({ease:{type:'string',minLength:1,maxLength:64}}),open,'Edit'),
  spec('animation.layers.stagger','Stagger selected layers (Shift or Ctrl click adds layers)',(p:{frames?:number;layers?:string[];timing?:boolean}={})=>{
   const ids=p.layers??layerSetIds(animationSession().getState().view.selectedLayer);
   return run(guard(()=>staggerLayers(doc(),ids,p.frames??2,p.timing??true)));
  },object({frames:{type:'integer',minimum:-600,maximum:600},layers:{type:'array',items:layerRef,minItems:2,maxItems:200},timing:{type:'boolean'}},[]),()=>open()&&layerSetIds(animationSession().getState().view.selectedLayer).length>1,'Edit'),
  spec('animation.motion.apply','Apply a motion preset to the selected layers',(p:{preset:string;layers?:string[]})=>{
   const set=findMotion(doc(),p.preset)??fail('Unknown motion preset.');const ids=p.layers??layerSetIds(animationSession().getState().view.selectedLayer);if(!ids.length)fail('Select a layer first.');
   return run(guard(()=>{try{return ids.flatMap(id=>motionEdits(doc(),id,set,playhead()));}catch(e){if(e instanceof Error&&!(e instanceof EditError))throw Object.assign(e,{expected:true});throw e;}}));
  },object({preset:{type:'string',minLength:1,maxLength:64},layers:{type:'array',items:layerRef,minItems:1,maxItems:200}},['preset']),()=>open()&&!!animationSession().getState().view.selectedLayer,'Edit'),
  spec('animation.motion.save','Save the selected keys as a motion preset',(p:{name:string})=>{
   const id=selected();const keys=selKeys();const layer=findLayer(comp(),id)!;
   try{const set=motionFromKeys(layer,keys,p.name);run(saveMotionEdit(doc(),set));return set.id;}catch(e){throw Object.assign(e as Error,{expected:true});}
  },object({name:{type:'string',minLength:1,maxLength:40}}),hasSel,'Edit'),
  spec('animation.motion.delete','Delete a saved motion preset',(p:{preset:string})=>{try{run(deleteMotionEdit(doc(),p.preset));}catch(e){throw Object.assign(e as Error,{expected:true});}},object({preset:{type:'string',minLength:1,maxLength:64}}),open,'Edit'),
  spec('animation.motion.export','Export saved motion presets as a JSON file',(p:{presets?:string[]}={})=>{
   const items=userMotions(doc());const pick=p.presets?items.filter(m=>p.presets!.includes(m.id)):items;if(!pick.length)fail('No saved presets to export.');
   const text=exportMotionsJson(pick);downloadBlob(new Blob([text],{type:'application/json'}),'somnia-motions.json');return pick.length;
  },object({presets:{type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:50}},[]),()=>open()&&userMotions(animationSession().document).length>0,'Edit'),
  spec('animation.motion.import','Import motion presets from a JSON file',(p:{json:string})=>{
   try{const sets=parseMotionsJson(p.json);run(mergeMotionsEdit(doc(),sets));return sets.length;}catch(e){throw Object.assign(e as Error,{expected:true});}
  },object({json:{type:'string',minLength:2,maxLength:300000}}),open,'Edit'),
  spec('animation.keys.selectAll','Select all keys of the layer',(p:{layer?:string}={})=>{const id=layerIdOf(p);animationSession().selectKeys(allKeysOf(doc(),id));},object({layer:layerRef},[]),open,'View'),
  spec('animation.keys.delete','Delete selected keys',(p:{keys?:KeyRef[]}={})=>{const keys=p.keys??selKeys();run({type:'keys.remove',keys});animationSession().selectKeys([]);},object({keys:keyRefs},[]),hasSel),
  spec('animation.keys.copy','Copy selected keys',()=>{copySelection();},undefined,()=>open()&&hasKeySelection()),
  spec('animation.keys.cut','Cut selected keys',()=>{cutSelection();},undefined,()=>open()&&hasKeySelection()),
  spec('animation.keys.paste','Paste keys at playhead',(p:{layer?:string}={})=>{
   if(needsSetPaste()){pasteSelection(p.layer);return;}
   const clip=getKeyClip()??fail('No copied keys. Copy keys first.');const layer=layerIdOf(p);const at=playhead();
   run({type:'keys.paste',layer,items:clip.items,t:at});animationSession().selectKeys(pastedRefs(layer,clip,at,comp().fps));},object({layer:layerRef},[]),()=>open()&&(!!getKeyClip()||needsSetPaste())),
  spec('animation.keys.nudge','Move selected keys',(p:{ticks:number})=>{const keys=selKeys();run({type:'keys.move',keys,delta:p.ticks});
   const fps=comp().fps;animationSession().selectKeys(shiftSelection(keys,snapToFrame(keys[0].t+p.ticks,fps)-keys[0].t));},object({ticks:{type:'integer'}}),hasSel),
  spec('animation.keys.ease','Set ease of selected keys',(p:{preset:EasePreset})=>{const e=EASE_PRESETS[p.preset]??fail('Unknown ease preset.');run({type:'keys.interp',keys:selKeys(),interp:e.interp,...('out' in e?{out:e.out,in:e.in}:{})});},object({preset:{enum:Object.keys(EASE_PRESETS)}}),hasSel),
  spec('animation.keys.smooth','Smooth position path through selected keys',()=>{run({type:'keys.spatial',keys:selKeys().filter(k=>k.prop==='position'),mode:'smooth'});},undefined,hasSel),
  spec('animation.keys.straighten','Straighten position path at selected keys',()=>{run({type:'keys.spatial',keys:selKeys().filter(k=>k.prop==='position'),mode:'straight'});},undefined,hasSel),
  spec('animation.key.spatial','Set position tangents of a key',(p:{layer?:string;t?:number;sIn?:[number,number];sOut?:[number,number]})=>run({type:'key.spatial',layer:layerIdOf(p),prop:'position',t:p.t??playhead(),...(p.sIn?{sIn:p.sIn}:{}),...(p.sOut?{sOut:p.sOut}:{})}),
   object({layer:layerRef,t:tick,sIn:{type:'array',items:num,minItems:2,maxItems:2},sOut:{type:'array',items:num,minItems:2,maxItems:2}},[])),
  spec('animation.workarea.set','Set work area',(p:{inT:number;outT:number})=>run({type:'workarea.set',in:p.inT,out:p.outT}),object({inT:tick,outT:tick}),open,'View'),
  spec('animation.workarea.in','Set work area start at playhead',()=>run({type:'workarea.set',in:playhead(),out:comp().workArea.out}),undefined,open,'View'),
  spec('animation.workarea.out','Set work area end at playhead',()=>run({type:'workarea.set',in:comp().workArea.in,out:playhead()}),undefined,open,'View'),
  spec('animation.workarea.reset','Reset work area to the whole composition',()=>run({type:'workarea.set',in:comp().start,out:comp().start+comp().duration}),undefined,open,'View'),
  spec('animation.layer.pathCombine','Combine two path layers into one compound path',(p:{layer?:string;other:string})=>run(combinePathsEdits(doc(),layerIdOf(p),p.other)),object({layer:layerRef,other:layerRef},['other'])),
  spec('animation.layer.pathBoolean','Unite, subtract, intersect or exclude two path layers',(p:{layer?:string;other:string;op:string})=>run(booleanEdits(doc(),layerIdOf(p),p.other,p.op as never)),object({layer:layerRef,other:layerRef,op:{enum:['unite','subtract','intersect','exclude']}},['other','op']),open,'Insert'),
  spec('animation.mask.boolean','Unite, subtract, intersect or exclude two masks',(p:{layer?:string;mask:string;other:string;op:string})=>run(maskBooleanEdit(doc(),layerIdOf(p),p.mask,p.other,p.op as never)),object({layer:layerRef,mask:layerRef,other:layerRef,op:{enum:['unite','subtract','intersect','exclude']}},['mask','other','op']),open,'Insert'),
  spec('animation.layer.expandStroke','Expand the stroke of a path layer into an outline layer',(p:{layer?:string})=>{const id=newId('layer');run(expandStrokeEdits(doc(),layerIdOf(p),id));animationSession().setView({selectedLayer:id});},object({layer:layerRef},[]),open,'Insert'),
  spec('animation.layer.pen','Toggle the pen tool for path layers',()=>{setLayerPen(!getLayerPen());},undefined,open,'Insert'),
  spec('animation.playback.loop','Toggle looped playback',()=>animationSession().setView({loop:!animationSession().getState().view.loop}),undefined,open,'View'),
  spec('animation.graph.toggle','Switch between timeline and graph editor',()=>animationSession().setView({graph:!animationSession().getState().view.graph}),undefined,open,'View'),
  spec('animation.export.settings','Set export size, frame rate, frame range or preset',(p:{preset?:string;scale?:number;fps?:number|null;from?:number|null;to?:number|null;reset?:boolean}={})=>{
   try{if(p.reset)resetExportSettings();if(p.preset)applyExportPreset(p.preset);const {preset:_p,reset:_r,...rest}=p;if(Object.keys(rest).length)setExportSettings(rest);}catch(e){throw e instanceof ExportError?Object.assign(e,{expected:true}):e;}
  },object({preset:{enum:EXPORT_PRESETS.map(x=>x.id)},reset:{type:'boolean'},scale:{type:'integer',minimum:10,maximum:400},fps:{oneOf:[{type:'integer',minimum:1,maximum:60},{type:'null'}]},from:{oneOf:[{type:'integer',minimum:0},{type:'null'}]},to:{oneOf:[{type:'integer',minimum:0},{type:'null'}]}},[]),open,'Project'),
  spec('animation.export.frame','Export current frame as PNG',()=>exportCurrentFrame().then(()=>undefined,e=>{throw e instanceof ExportError?Object.assign(e,{expected:true}):e;}),undefined,open,'Project'),
  spec('animation.export.sequence','Export work area as PNG sequence (ZIP)',()=>exportWorkAreaSequence().then(()=>undefined,e=>{throw e instanceof ExportError?Object.assign(e,{expected:true}):e;}),undefined,open,'Project'),
  spec('animation.export.gif','Export work area as GIF',()=>exportGif().then(()=>undefined,e=>{throw e instanceof ExportError?Object.assign(e,{expected:true}):e;}),undefined,open,'Project'),
  spec('animation.export.apng','Export work area as APNG (animated PNG)',()=>exportApng().then(()=>undefined,e=>{throw e instanceof ExportError?Object.assign(e,{expected:true}):e;}),undefined,open,'Project'),
  spec('animation.export.webm','Export work area as WebM video (real time)',()=>exportWebM().then(()=>undefined,e=>{throw e instanceof ExportError?Object.assign(e,{expected:true}):e;}),undefined,open,'Project'),
  spec('animation.playhead.set','Move playhead',(p:{seconds:number})=>animationSession().setView({playhead:secondsToTicks(p.seconds)}),object({seconds:num}),open,'View'),
 ...renderQueueSpecs(),...templateRenameSpecs(),...onionSpecs(),...rigSpecs(),...keyStretchSpecs(),...layerTimingSpecs(),...keySetClipSpecs(),...keyRepeatSpecs(),...keyReverseSpecs(),...keyInvertSpecs(),...keyRangeSpecs(),...keyValuesSpecs(),...keyEaseRandomSpecs(),...keyNthSpecs(),...keyDistributeSpecs(),...keyToPlayheadSpecs(),...keyJitterTimeSpecs(),...keyPropertySpecs(),...keyThinSpecs(),...keyMatchSpecs(),...keyFlattenSpecs(),...keyEaseCopySpecs(),...keyRampSpecs(),...keyPeaksSpecs(),...keyInvertSelectionSpecs(),...keyInfluenceSpecs(),...keyTameSpecs(),...keyEchoSpecs(),...keyAllSpecs(),...keyTrimSpecs(),...keyWorkAreaSpecs(),...keyInWorkAreaSpecs(),...keyPlayheadSelectSpecs()] as CommandSpec<unknown,unknown>[];
}
export const ANIMATION_COMMANDS=animationCommandSpecs().map(s=>s.id);
const DESTRUCTIVE=new Set(['animation.layer.remove','animation.keys.delete','animation.keys.cut','animation.audio.volume.keyRemove','animation.precomp.volume.keyRemove','animation.stroke.keyRemove','animation.color.keyRemove','animation.styleKeys.delete']);
export function registerAnimationCommands(){
 const offs=animationCommandSpecs().map(s=>{const off=registerCommandSpec(s);const c=commandRegistry.get(s.id);if(c){c.studio='animation';c.argsSchema=s.params;c.risk=DESTRUCTIVE.has(s.id)?'destructive':'content';}return off;});
 return()=>offs.forEach(off=>off());
}
