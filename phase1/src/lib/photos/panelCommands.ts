import {getPhotoExportState,setPhotoExportState} from './exportState';
/**
 * Photos Studio panel commands. Every action of the side panels goes through these specs (palette, menus, AI).
 * `level: 'ui'` for edits (interactive origins only, agents and MCP are refused), `read` for state.
 * History: every edit is one `commitPhotoSettings` step in the session's own undo stack (studioSession.ts).
 * Registration is scoped to the Photos canvas mount (`registerPhotosCommands()`), like design and sheets.
 */
import {registerCommandSpec} from '../commandBridge';
import type {CommandSpec} from '../commandSpec';
import {getMedia} from '../media';
import {applyPhotoCrop,cancelPhotoCrop,commitPhotoSettings,dirtyPhoto,exportPhotoCopy,flipPhoto,getPhotoSession,historyPhoto,resetPhoto,rotatePhoto,setPhotoCropDraft,setPhotoCropping,type PhotoSession} from './studioSession';
import {exportPhotoCopyAdvanced} from './studioSession';
import {PHOTO_EXPORT_DEFAULTS,photoOptionsToValues,valuesToPhotoOptions,type PhotoAdvancedOptions} from './photosExportSchema';
import {isNeutralPhoto,neutralPhotoSettings,PHOTO_CONTROLS,type PhotoSettings} from './studioSettings';
import {applyLook,BUILT_IN_PRESETS,LOOK_KEYS,type Look} from './presets';
import {findWbPreset,WB_PRESETS} from './wbPresets';
import {decodeSettingsPayload} from './settingsClipboard';
import {aspectRatio,CROP_ASPECTS,fitAspect,isCropAspect,orientedSize,outputSize,swapAspect,type CropAspect} from './cropAspect';
import {estimateHorizon} from './autoStraighten';
import {describeChange,stepsTo} from './historyLog';
import {computeHistogram,toneZones} from './histogram';

const none={type:'object',properties:{},additionalProperties:false} as const;
const SECTIONS=['light','color','effects','detail','transform'] as const;
type Section=(typeof SECTIONS)[number];
const SLIDER_KEYS=PHOTO_CONTROLS.map(c=>c.key);
/** Name of the photo the Photos studio shows right now, or null. */
export function activePhotoName():string|null{const m=getMedia();return m.active&&getPhotoSession(m.active)?m.active:null;}
const ready=():boolean=>{const n=activePhotoName();const s=n?getPhotoSession(n):null;return !!s&&s.status!=='loading'&&s.status!=='error';};
export const photoExportEnabled=()=>{const n=activePhotoName(),s=n?getPhotoSession(n):null;return !!s&&s.status==='ready'&&!s.cropping&&!getPhotoExportState().working;};
const need=():string=>{const n=activePhotoName();if(!n||!ready())throw Error('Open a photo in the Photos studio first.');return n;};
const session=():PhotoSession=>getPhotoSession(need())!;
const lookSchema={type:'object',properties:Object.fromEntries(LOOK_KEYS.map(k=>{const c=PHOTO_CONTROLS.find(x=>x.key===k)!;return [k,{type:'number',minimum:c.min,maximum:c.max}];})),additionalProperties:false} as const;

export interface PhotoStateSummary{
 open:boolean;name:string;status:string;dirty:boolean;width:number;height:number;outputWidth:number;outputHeight:number;
 neutral:boolean;cropping:boolean;canUndo:boolean;canRedo:boolean;historySteps:number;changed:string[];
}
export function photoStateSummary():PhotoStateSummary{
 const n=activePhotoName();const s=n?getPhotoSession(n):null;
 if(!s||!n)return {open:false,name:'',status:'none',dirty:false,width:0,height:0,outputWidth:0,outputHeight:0,neutral:true,cropping:false,canUndo:false,canRedo:false,historySteps:0,changed:[]};
 const out=outputSize(s.sourceWidth,s.sourceHeight,s.now);
 return {open:true,name:n,status:s.status,dirty:dirtyPhoto(s),width:s.sourceWidth,height:s.sourceHeight,outputWidth:out.width,outputHeight:out.height,
  neutral:isNeutralPhoto(s.now),cropping:s.cropping,canUndo:s.past.length>0,canRedo:s.future.length>0,historySteps:s.past.length,
  changed:describeChange(neutralPhotoSettings,s.now).map(c=>c.key)};
}
/** Keys of one panel section; `all` is every slider plus geometry. */
export function sectionKeys(section:Section|'all'):(keyof PhotoSettings&string)[]{
 if(section==='all')return [...SLIDER_KEYS];
 return PHOTO_CONTROLS.filter(c=>c.section===section).map(c=>c.key);
}
export function resetSection(name:string,section:Section|'all'){
 if(section==='all'){resetPhoto(name);return;}
 if(section==='transform'){commitPhotoSettings(name,s=>({...s,straighten:0,orientation:0,flipH:false,flipV:false,crop:null}));return;}
 const keys=sectionKeys(section);
 commitPhotoSettings(name,s=>{const next={...s} as Record<string,unknown>;for(const k of keys)next[k]=neutralPhotoSettings[k];return next as unknown as PhotoSettings;});
}
/** The full list of specs, exported for tests and for scripts/dump-ui-commands.ts. */
export function photosCommandSpecs():CommandSpec<never,unknown>[]{
 const specs:CommandSpec<never,unknown>[]=[
  {id:'photos.getState',title:'Photos: Read photo state',category:'Tools',level:'read',keywords:['photos','state','info'],params:none,run:()=>photoStateSummary()},
  {id:'photos.getHistogram',title:'Photos: Read histogram summary',category:'Tools',level:'read',keywords:['photos','histogram','clipping'],params:none,
   enabled:()=>!!activePhotoName()&&!!getPhotoSession(activePhotoName())?.frame,
   run:()=>{const f=session().frame;if(!f)throw Error('No rendered frame yet.');const h=computeHistogram(f.bytes);const {clipChannels,meanLuma,medianLuma,clipShadows,clipHighlights,count}=h;return {samples:count,meanLuma,medianLuma,clipShadows,clipHighlights,clipChannels,zones:toneZones(h)};}},
  {id:'photos.setAdjustment',title:'Photos: Set an adjustment',category:'Edit',level:'ui',keywords:['photos','exposure','contrast','slider'],
   params:{type:'object',properties:{key:{type:'string',enum:SLIDER_KEYS},value:{type:'number'}},required:['key','value'],additionalProperties:false},enabled:ready,
   run:(p:{key:keyof PhotoSettings&string;value:number})=>{const name=need();if(!SLIDER_KEYS.includes(p.key))throw Error(`Unknown adjustment: ${p.key}`);commitPhotoSettings(name,s=>({...s,[p.key]:p.value}));}},
  {id:'photos.resetAdjustments',title:'Photos: Reset adjustments',category:'Edit',level:'ui',keywords:['photos','reset','neutral'],
   params:{type:'object',properties:{section:{type:'string',enum:[...SECTIONS,'all']}},additionalProperties:false},enabled:ready,
   run:(p:{section?:Section|'all'})=>resetSection(need(),p.section??'all')},
  {id:'photos.applyLook',title:'Photos: Apply a look',category:'Edit',level:'ui',keywords:['photos','preset','look','filter'],
   params:{type:'object',properties:{preset:{type:'string',enum:BUILT_IN_PRESETS.map(p=>p.id)},look:lookSchema},additionalProperties:false,minProperties:1},enabled:ready,
   run:(p:{preset?:string;look?:Look})=>{
    const name=need();let look=p.look;
    if(p.preset){const b=BUILT_IN_PRESETS.find(x=>x.id===p.preset);if(!b)throw Error(`Unknown preset: ${p.preset}`);look=b.look;}
    if(!look)throw Error('Give a preset id or a look.');
    const l=look;commitPhotoSettings(name,s=>applyLook(s,l));}},
  {id:'photos.wb.preset',title:'Photos: Apply a white-balance preset',category:'Edit',level:'ui',keywords:['photos','white balance','wb','kelvin','tint'],
   params:{type:'object',properties:{preset:{type:'string',enum:WB_PRESETS.map(p=>p.id)}},required:['preset'],additionalProperties:false},enabled:ready,
   run:(p:{preset:string})=>{const b=findWbPreset(p.preset);if(!b)throw Error(`Unknown preset: ${p.preset}`);
    commitPhotoSettings(need(),s=>({...s,temp:b.temp,tint:b.tint}));}}, // one commit: temp+tint land as a single history entry
  {id:'photos.applyVersion',title:'Photos: Apply a saved version',category:'Edit',level:'ui',keywords:['photos','version','snapshot','history'],
   params:{type:'object',properties:{payload:{type:'object'}},required:['payload'],additionalProperties:false},enabled:ready,
   run:(p:{payload:unknown})=>{const s=decodeSettingsPayload(p.payload);if(!s)throw Error('Malformed version payload.');commitPhotoSettings(need(),()=>s);}},
  {id:'photos.rotate',title:'Photos: Rotate a quarter turn',category:'Edit',level:'ui',keywords:['photos','rotate'],
   params:{type:'object',properties:{direction:{type:'integer',enum:[-1,1]}},required:['direction'],additionalProperties:false},enabled:ready,
   run:(p:{direction:1|-1})=>rotatePhoto(need(),p.direction)},
  {id:'photos.flip',title:'Photos: Flip',category:'Edit',level:'ui',keywords:['photos','flip','mirror'],
   params:{type:'object',properties:{axis:{type:'string',enum:['h','v']}},required:['axis'],additionalProperties:false},enabled:ready,
   run:(p:{axis:'h'|'v'})=>flipPhoto(need(),p.axis)},
  {id:'photos.crop.start',title:'Photos: Start cropping',category:'Edit',level:'ui',keywords:['photos','crop'],params:none,enabled:()=>ready()&&!getPhotoSession(activePhotoName())!.cropping,run:()=>setPhotoCropping(need(),true)},
  {id:'photos.crop.apply',title:'Photos: Apply crop',category:'Edit',level:'ui',keywords:['photos','crop'],params:none,enabled:()=>ready()&&!!getPhotoSession(activePhotoName())?.cropping,run:()=>applyPhotoCrop(need())},
  {id:'photos.crop.cancel',title:'Photos: Cancel crop',category:'Edit',level:'ui',keywords:['photos','crop'],params:none,enabled:()=>ready()&&!!getPhotoSession(activePhotoName())?.cropping,run:()=>cancelPhotoCrop(need())},
  {id:'photos.crop.reset',title:'Photos: Remove crop',category:'Edit',level:'ui',keywords:['photos','crop','reset'],params:none,enabled:()=>ready()&&!!getPhotoSession(activePhotoName())?.now.crop,
   run:()=>{const n=need();cancelPhotoCrop(n);commitPhotoSettings(n,s=>({...s,crop:null}));}},
  {id:'photos.crop.setAspect',title:'Photos: Set crop aspect ratio',category:'Edit',level:'ui',keywords:['photos','crop','aspect','ratio'],
   params:{type:'object',properties:{aspect:{type:'string',enum:[...CROP_ASPECTS]}},required:['aspect'],additionalProperties:false},enabled:ready,
   run:(p:{aspect:CropAspect})=>{
    const name=need();if(!isCropAspect(p.aspect))throw Error('Unknown aspect.');
    const s=session();const f=orientedSize(s.sourceWidth,s.sourceHeight,s.now.orientation);
    const ratio=aspectRatio(p.aspect,f.width,f.height);
    if(!s.cropping)setPhotoCropping(name,true);
    if(ratio===null)return;
    const base=getPhotoSession(name)!.cropDraft??s.now.crop??{x0:0,y0:0,x1:1,y1:1};
    setPhotoCropDraft(name,fitAspect(base,ratio,f.width,f.height));}},
  {id:'photos.straighten.auto',title:'Photos: Auto straighten from the estimated horizon',category:'Edit',level:'ui',keywords:['photos','straighten','horizon','auto'],params:none,
   enabled:()=>ready()&&!!getPhotoSession(activePhotoName())?.frame,
   run:()=>{
    const name=need();const f=session().frame;if(!f)throw Error('No rendered frame yet.');
    const a=estimateHorizon(new Uint8Array(f.bytes.slice(0)),f.width,f.height);
    if(a===null)throw Error('No usable horizon found.'); // the UI leaves the setting alone
    commitPhotoSettings(name,now=>({...now,straighten:a}));}},
  {id:'photos.crop.swapAspect',title:'Photos: Swap crop aspect orientation',category:'Edit',level:'ui',keywords:['photos','crop','aspect','swap','portrait','landscape'],params:none,
   enabled:()=>ready()&&!!(getPhotoSession(activePhotoName())?.cropping||getPhotoSession(activePhotoName())?.now.crop),
   run:()=>{
    const name=need();const s=session();
    const f=orientedSize(s.sourceWidth,s.sourceHeight,s.now.orientation);
    if(s.cropping){ // the in-flight draft turns a quarter
     setPhotoCropDraft(name,swapAspect(s.cropDraft??s.now.crop??{x0:0,y0:0,x1:1,y1:1},f.width,f.height));
    }else if(s.now.crop){ // a committed crop swaps as one undo step
     commitPhotoSettings(name,now=>({...now,crop:swapAspect(now.crop!,f.width,f.height)}));
    }}},
  {id:'photos.undo',title:'Photos: Undo develop step',category:'Edit',level:'ui',keywords:['photos','undo'],params:none,enabled:()=>ready()&&getPhotoSession(activePhotoName())!.past.length>0,run:()=>historyPhoto(need(),false)},
  {id:'photos.redo',title:'Photos: Redo develop step',category:'Edit',level:'ui',keywords:['photos','redo'],params:none,enabled:()=>ready()&&getPhotoSession(activePhotoName())!.future.length>0,run:()=>historyPhoto(need(),true)},
  {id:'photos.history.jump',title:'Photos: Jump to a history step',category:'Edit',level:'ui',keywords:['photos','history'],
   params:{type:'object',properties:{index:{type:'integer',minimum:0}},required:['index'],additionalProperties:false},enabled:ready,
   run:(p:{index:number})=>{const name=need();const steps=stepsTo(session(),p.index);if(steps===null)throw Error('No such history step.');for(let i=0;i<Math.abs(steps);i++)historyPhoto(name,steps>0);}},
  {id:'photos.export.open',title:'Photos: Export copy...',category:'Project',level:'ui',shortcut:'Mod+Shift+E',params:none,enabled:photoExportEnabled,run:()=>setPhotoExportState({open:true})},
  ...(['png','jpeg'] as const).map(format=>({id:'photos.export.'+format,title:'Photos: Export as '+format.toUpperCase(),category:'Project' as const,level:'ui' as const,params:none,enabled:photoExportEnabled,run:()=>runPhotoExport(format)})),
  {id:'photos.export',title:'Photos: Export a developed copy',category:'Project',level:'ui',keywords:['photos','export','save','png','jpeg'],
   params:{type:'object',properties:{format:{type:'string',enum:['png','jpeg']}},required:['format'],additionalProperties:false},enabled:photoExportEnabled,
   run:async(p:{format:'png'|'jpeg'})=>runPhotoExport(p.format)},
  {id:'photos.export.advanced',title:'Photos: Advanced export with size, quality, profile and metadata',category:'Project',level:'ui',keywords:['photos','export','advanced','webp','quality','metadata'],
   params:{type:'object',additionalProperties:false,properties:{format:{type:'string',enum:['png','jpeg','webp']},name:{type:'string'},mode:{type:'string',enum:['percent','exact']},scalePercent:{type:'number'},width:{type:'number'},height:{type:'number'},lockAspect:{type:'boolean'},quality:{type:'number'},profile:{type:'string',enum:['srgb','display-p3','grayscale']},metaTitle:{type:'string'},metaAuthor:{type:'string'},metaCopyright:{type:'string'},metaDescription:{type:'string'}}},enabled:photoExportEnabled,
   run:async(p:Partial<PhotoAdvancedOptions>)=>{const name=need();if(!photoExportEnabled())throw Error('Photo export is busy.');setPhotoExportState({working:true});
    try{const base=name.replace(/\.[^.\\/]+$/,'');return await exportPhotoCopyAdvanced(name,valuesToPhotoOptions({...photoOptionsToValues({...PHOTO_EXPORT_DEFAULTS,name:base}),...p}));}finally{setPhotoExportState({working:false});}}},
 ];
 return specs;
}
async function runPhotoExport(format:'png'|'jpeg'){const name=need();if(!photoExportEnabled())throw Error('Photo export is busy.');setPhotoExportState({working:true,format});try{return await exportPhotoCopy(name,format);}finally{setPhotoExportState({working:false});}}
let refs=0,disposeAll:(()=>void)|null=null;
/**
 * Registers every Photos panel command. Reference counted: the canvas and any mounted panel may all call it,
 * the specs exist once while at least one caller is mounted. Returns this caller's release function.
 */
export function registerPhotosCommands():()=>void{
 if(refs===0){
  const offs:Array<()=>void>=[];
  try{for(const spec of photosCommandSpecs())offs.push(registerCommandSpec(spec as CommandSpec<unknown,unknown>));}
  catch(e){for(const off of offs.reverse())off();throw e;}
  disposeAll=()=>{for(const off of offs.splice(0).reverse())off();};
 }
 refs++;let released=false;
 return()=>{if(released)return;released=true;refs--;if(refs===0){disposeAll?.();disposeAll=null;}};
}
