import {registerStudio,type StudioDef} from './registry';
/** Sheets Studio: XLSX workbooks in an isolated spreadsheet engine (WASM worker). Document buffers stay outside the shell. */
export const sheetsStudio:StudioDef={
 id:'sheets',label:'studio.sheets',icon:'Table2',order:2,
 formats:[{ext:'xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',priority:10}],
 shell:{
  leftRail:[{id:'files',label:'Files',icon:'Files',global:true},{id:'search',label:'Search',icon:'Search',global:true},{id:'versions',label:'Versions',icon:'VersionsIcon',global:true}],
  rightRail:[],
  header:{menus:['Project','Edit','View','Tools','Help'],views:[]},
  bottomBar:{slots:['cursor'],viewportPresets:[]},inspector:'sheets.inspector',tools:[]
 },commands:[],
 shortcuts:{},menus:{view:[]},canvas:'sheets.canvas',
 agent:{tools:[],contextProviders:['activeDocument'],quickActions:[]},deriveContext:context=>context
};
registerStudio(sheetsStudio);
