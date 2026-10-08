import {registerStudio,type StudioDef} from './registry';
export const codeStudio:StudioDef={
 id:'code',label:'studio.code',icon:'Code2',order:0,
 formats:[...['html','htm','css','js','jsx','ts','tsx','json','md','markdown','tex','svg','txt','*'].map(ext=>({ext,priority:0}))],
 shell:{
  leftRail:[{id:'layers',label:'Layers',icon:'Layers'},{id:'files',label:'Files',icon:'Files',global:true},{id:'search',label:'Search',icon:'Search',global:true},{id:'components',label:'Components',icon:'Boxes'},{id:'css',label:'CSS',icon:'Paintbrush'},{id:'versions',label:'Versions',icon:'VersionsIcon',global:true}],
  rightRail:[{id:'design',label:'Design',icon:'SlidersHorizontal'},{id:'prototype',label:'Prototype',icon:'Play'}],
  header:{menus:['Project','Edit','View','Insert','Tools','Help'],views:[{mode:'design',icon:'MousePointer2',command:'view.design'},{mode:'split',icon:'Columns2',command:'view.split'},{mode:'code',icon:'Code2',command:'view.code'}]},
  bottomBar:{slots:['viewport','cursor','breakpoint','zoom'],viewportPresets:[{width:1280,icon:'Monitor',label:'status.desktop'},{width:820,icon:'Tablet',label:'status.tablet'},{width:390,icon:'Smartphone',label:'status.mobile'}]},
  inspector:'code.inspector',tools:[]
 },commands:[{id:'view.design',label:'cmd.view.design'},{id:'view.split',label:'cmd.view.split'},{id:'view.code',label:'cmd.view.code'}],
 shortcuts:{'view.code':'Mod+1','view.design':'Mod+2','view.split':'Mod+3'},menus:{view:['view.design','view.split','view.code']},canvas:'code.canvas',
 agent:{tools:[],contextProviders:['activeDocument','selection'],quickActions:[]},deriveContext:context=>context
};
registerStudio(codeStudio);
