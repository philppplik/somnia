import {registerStudio,type StudioDef} from './registry';
import type {PanelDef,RailItemDef,StudioShellDef,InspectorDef,StudioLayout} from '../shell/types';
/**
 * Documents studio manifest (pure data). Hosts live in components/documents/registerShell.ts.
 * Left: Files, Pages (thumbnails), Outline (paragraph list), Search, Versions. Right: the generic inspector with
 * Document, Selected paragraph, Edit text and Risks sections. Canvas context: `selection` (caret paragraph) and
 * `services.ready` / `services.risks` are published by DocumentsCanvas.
 */
const left=(id:string,component:string,title:string,titleKey?:string):PanelDef=>({id,title,titleKey,component,side:'left',icon:undefined});
export const documentsPanels:readonly PanelDef[]=[
 left('files','code.files','Files'),
 left('pages','documents.pages','Pages','documents.rail.pages'),
 left('outline','documents.outline','Outline','documents.rail.outline'),
 left('search','code.search','Search'),
 left('versions','code.versions','Versions'),
 {id:'inspector',title:'Document',titleKey:'documents.inspector',component:'shell.inspector',side:'right',defaultOpen:true},
];
export const documentsLeftRail:readonly RailItemDef[]=[
 {id:'files',icon:'Files',label:'Files',kind:'panel',panel:'files',order:10},
 {id:'pages',icon:'Copy',label:'Pages',labelKey:'documents.rail.pages',kind:'panel',panel:'pages',order:20},
 {id:'outline',icon:'Hash',label:'Outline',labelKey:'documents.rail.outline',kind:'panel',panel:'outline',order:30},
 {id:'search',icon:'Search',label:'Search',kind:'panel',panel:'search',order:40},
 {id:'versions',icon:'VersionsIcon',label:'Versions',kind:'panel',panel:'versions',order:50},
];
export const documentsRightRail:readonly RailItemDef[]=[
 {id:'inspector',icon:'FileText',label:'Document',labelKey:'documents.inspector',kind:'panel',panel:'inspector',order:10},
];
export const documentsInspector:InspectorDef={titleKey:'documents.inspector',emptyKey:'documents.inspector.none',sections:[
 {id:'document',title:'Document',titleKey:'documents.inspector.section.document',component:'documents.inspector.document',order:10},
 {id:'selection',title:'Selected paragraph',titleKey:'documents.inspector.section.selection',component:'documents.inspector.selection',when:"selection.kind == 'one'",order:20},
 {id:'text',title:'Edit text',titleKey:'documents.edit.title',component:'documents.inspector.text',when:'services.ready',order:30,defaultCollapsed:true,commands:['documents.outline.goto']},
 {id:'risks',title:'Risks',titleKey:'documents.inspector.section.risks',component:'documents.inspector.risks',when:'services.risks',order:40},
]};
export const DOCUMENTS_LAYOUT:StudioLayout={leftOpen:true,rightOpen:true,leftWidth:260,rightWidth:320,leftPanels:['files'],rightPanels:['inspector'],activeLeft:'files',activeRight:'inspector'};
export const documentsShell:StudioShellDef={panels:documentsPanels,leftRail:documentsLeftRail,rightRail:documentsRightRail,inspector:documentsInspector,defaultLayout:DOCUMENTS_LAYOUT};
/** Panel-owned commands, for the validator and the palette. */
export const DOCUMENTS_COMMANDS=['documents.zoomIn','documents.zoomOut','documents.zoomReset','documents.undo','documents.redo','documents.pages.goto','documents.outline.goto'] as const;
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
 shortcuts:{'studio.documents':'Mod+2'},menus:{view:[]},canvas:'documents.canvas',shellV2:documentsShell,
 agent:{tools:[],contextProviders:['activeDocument'],quickActions:[]},deriveContext:context=>context
};
registerStudio(documentsStudio);
