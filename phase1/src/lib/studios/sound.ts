import {registerStudio,type StudioDef} from './registry';
/** Sound Studio: SoundCraft decode and offline DSP in a WASM worker. Documents are media tabs; the Code studio is untouched. */
export const soundStudio:StudioDef={
 id:'sound',label:'studio.sound',icon:'AudioWaveform',order:50,
 formats:['mp3','wav','flac','ogg','oga','aif','aiff'].map(ext=>({ext,priority:10})),
 shell:{
  leftRail:[{id:'files',label:'Files',icon:'Files',global:true}],
  rightRail:[],
  header:{menus:['Project','Edit','View','Tools','Help'],views:[]},
  bottomBar:{slots:[],viewportPresets:[]},
  inspector:'sound.inspector',tools:[]
 },
 commands:[],shortcuts:{'studio.sound':'Mod+5'},menus:{view:[]},canvas:'sound.canvas',
 agent:{tools:['sound_inspect','sound_propose_settings'],contextProviders:['activeDocument'],quickActions:[]},deriveContext:context=>context
};
registerStudio(soundStudio);
