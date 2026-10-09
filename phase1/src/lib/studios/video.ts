import {registerStudio,type StudioDef} from './registry';
/** Video Studio: mediabunny demux/mux and WebCodecs encode in a worker. Documents are media tabs; the Code studio is untouched. */
export const videoStudio:StudioDef={
 id:'video',label:'studio.video',icon:'Film',order:60,
 formats:['mp4','m4v','mov','webm','mkv'].map(ext=>({ext,priority:10})),
 shell:{
  leftRail:[{id:'files',label:'Files',icon:'Files',global:true}],
  rightRail:[],
  header:{menus:['Project','Edit','View','Tools','Help'],views:[]},
  bottomBar:{slots:[],viewportPresets:[]},
  inspector:'video.inspector',tools:[]
 },
 commands:[],shortcuts:{'studio.video':'Mod+6'},menus:{view:[]},canvas:'video.canvas',
 agent:{tools:[],contextProviders:['activeDocument'],quickActions:[]},deriveContext:context=>context
};
registerStudio(videoStudio);
