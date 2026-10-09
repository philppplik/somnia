import {registerStudio,type StudioDef} from './registry';
/** Documents Studio: DOCX pages rendered by the headless WordCraft engine in a Worker. Viewing and "save a copy" only in this package. */
export const documentsStudio:StudioDef={
 id:'documents',label:'studio.documents',icon:'FileText',order:1,
 formats:[{ext:'docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',priority:10}],
 shell:{
  leftRail:[{id:'files',label:'Files',icon:'Files',global:true},{id:'search',label:'Search',icon:'Search',global:true},{id:'versions',label:'Versions',icon:'VersionsIcon',global:true}],
  rightRail:[{id:'design',label:'Document',icon:'FileText'}],
  header:{menus:['Project','Edit','View','Tools','Help'],views:[]},
  bottomBar:{slots:['zoom'],viewportPresets:[]},
  inspector:'documents.inspector',tools:[]
 },commands:[{id:'documents.saveCopy',label:'cmd.documents.saveCopy'},{id:'documents.zoomIn',label:'cmd.documents.zoomIn'},{id:'documents.zoomOut',label:'cmd.documents.zoomOut'}],
 shortcuts:{'studio.documents':'Mod+2'},menus:{view:[]},canvas:'documents.canvas',
 agent:{tools:[],contextProviders:['activeDocument'],quickActions:[]},deriveContext:context=>context
};
registerStudio(documentsStudio);
