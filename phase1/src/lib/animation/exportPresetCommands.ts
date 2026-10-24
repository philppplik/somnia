import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {exportState,setExportSettings,setExportTransparent} from './exportJob';
import {ExportError} from './exportFrames';
import {MAX_PRESET_NAME,deleteUserPreset,presetPatch,saveUserPreset,userExportPresets} from './exportUserPresets';
/** Own export presets: save the current export setup under a name, apply it, delete it. Session/browser state, no undo step. Own file so the big command array keeps cheap type inference. */
const open=()=>!!animationSession().document;
const guard=<T>(f:()=>T):T=>{try{return f();}catch(e){throw e instanceof ExportError?Object.assign(e,{expected:true}):e;}};
const name={type:'string',minLength:1,maxLength:MAX_PRESET_NAME};
export const exportPresetSpecs=():CommandSpec<unknown,unknown>[]=>[
 {id:'animation.export.preset.save',title:'Save the export settings as my preset',category:'Project',level:'ui',keywords:['animation','export','preset','save','own','my','settings','render'],
  params:{type:'object',properties:{name},required:['name'],additionalProperties:false},enabled:open,
  run:((p:{name:string})=>guard(()=>{const x=saveUserPreset(p?.name,exportState().settings,exportState().transparent);return x.id;})) as (p:unknown)=>unknown},
 {id:'animation.export.preset.apply',title:'Apply one of my export presets',category:'Project',level:'ui',keywords:['animation','export','preset','apply','own','my','settings','render'],
  params:{type:'object',properties:{id:{type:'string',minLength:1,maxLength:120}},required:['id'],additionalProperties:false},enabled:()=>open()&&userExportPresets().length>0,
  run:((p:{id:string})=>guard(()=>{const x=userExportPresets().find(y=>y.id===p?.id);if(!x)throw Object.assign(new Error('Unknown preset.'),{expected:true});setExportSettings(presetPatch(x));setExportTransparent(x.transparent);})) as (p:unknown)=>unknown},
 {id:'animation.export.preset.delete',title:'Delete one of my export presets',category:'Project',level:'ui',keywords:['animation','export','preset','delete','remove','own','my'],
  params:{type:'object',properties:{id:{type:'string',minLength:1,maxLength:120}},required:['id'],additionalProperties:false},enabled:()=>userExportPresets().length>0,
  run:((p:{id:string})=>guard(()=>deleteUserPreset(p?.id))) as (p:unknown)=>unknown},
];
