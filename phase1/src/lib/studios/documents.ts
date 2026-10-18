import {registerStudio,type StudioDef} from './registry';
import {getRegisteredLifecycleAdapter} from '../lifecycle/adapters';
import type {PanelDef,RailItemDef,StudioShellDef,InspectorDef,StudioLayout} from '../shell/types';
import {DOCUMENTS_PANEL_COMMANDS,DOCUMENTS_PANELS} from '../documents/panels';
import {registerDocumentsRailIcons} from '../documents/railIcons';
/**
 * Documents studio manifest (pure data). Hosts live in components/documents/registerShell.ts (foundation:
 * pages, inspector text/risks; wave A: outline, find, inspector document/selection).
 * Left rail: Files, Pages (thumbnails), Outline (paragraph list), Find (in the open document), Search, Versions.
 * Right rail: the generic inspector with the Document, Selected paragraph, Edit text and Risks sections.
 * Canvas context: `selection` (caret paragraph) and `services.ready` / `services.risks`, published by DocumentsCanvas.
 *
 * Ownership (shell wave): this manifest — rails, layout, the inspector section list — is wave B.
 * Panel definitions (outline/find) and panel commands come from wave A (lib/documents/panels.ts) and are
 * composed here; the studio-agnostic panels (files/search/versions) reuse the Code hosts.
 */
const left=(id:string,component:string,title:string,titleKey?:string,icon?:string):PanelDef=>({id,title,titleKey,component,side:'left',icon});
export const documentsPanels:readonly PanelDef[]=[
 left('files','code.files','Files'),
 left('pages','documents.pages','Pages','documents.rail.pages','BookOpen'),
 ...DOCUMENTS_PANELS,
 left('search','code.search','Search'),
 left('versions','code.versions','Versions'),
 {id:'inspector',title:'Document',titleKey:'documents.inspector',component:'shell.inspector',side:'right',icon:'FileText',defaultOpen:true},
];
export const documentsLeftRail:readonly RailItemDef[]=[
 {id:'files',icon:'Files',label:'Files',kind:'panel',panel:'files',order:10},
 {id:'pages',icon:'BookOpen',label:'Pages',labelKey:'documents.rail.pages',kind:'panel',panel:'pages',order:20},
 {id:'outline',icon:'List',label:'Outline',labelKey:'documents.rail.outline',kind:'panel',panel:'outline',order:30},
 {id:'find',icon:'FileSearchCorner',label:'Find',labelKey:'documents.rail.find',kind:'panel',panel:'find',order:40},
 {id:'search',icon:'Search',label:'Search',kind:'panel',panel:'search',order:50},
 {id:'versions',icon:'VersionsIcon',label:'Versions',kind:'panel',panel:'versions',order:60},
];
export const documentsRightRail:readonly RailItemDef[]=[
 {id:'inspector',icon:'FileText',label:'Document',labelKey:'documents.inspector',kind:'panel',panel:'inspector',order:10},
];
/** Section list (wave B). document/selection sections are wave A hosts; text/risks are foundation hosts. */
export const documentsInspector:InspectorDef={titleKey:'documents.inspector',emptyKey:'documents.inspector.none',sections:[
 {id:'document',title:'Document',titleKey:'documents.inspector.section.document',component:'documents.inspector.document',order:10},
 {id:'selection',title:'Selected paragraph',titleKey:'documents.inspector.section.selection',component:'documents.inspector.selection',when:"selection.kind == 'one'",order:20},
 {id:'text',title:'Edit text',titleKey:'documents.edit.title',component:'documents.inspector.text',when:'services.ready',order:30,defaultCollapsed:true,commands:['documents.outline.goto']},
 {id:'risks',title:'Risks',titleKey:'documents.inspector.section.risks',component:'documents.inspector.risks',when:'services.risks',order:40},
]};
export const DOCUMENTS_LAYOUT:StudioLayout={leftOpen:true,rightOpen:true,leftWidth:260,rightWidth:320,leftPanels:['files'],rightPanels:['inspector'],activeLeft:'files',activeRight:'inspector'};
export const documentsShell:StudioShellDef={panels:documentsPanels,leftRail:documentsLeftRail,rightRail:documentsRightRail,inspector:documentsInspector,defaultLayout:DOCUMENTS_LAYOUT};
/** Panel-owned commands, for the validator and the palette. Foundation commands plus the wave A panel commands. */
export const DOCUMENTS_COMMANDS=[...new Set(['documents.zoomIn','documents.zoomOut','documents.zoomReset','documents.undo','documents.redo','documents.pages.goto','documents.outline.goto',...DOCUMENTS_PANEL_COMMANDS])] as readonly string[];
export const documentsStudio:StudioDef={
 id:'documents',label:'studio.documents',icon:'FileText',order:1,
 formats:[{ext:'docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',priority:10}],
 shell:{
  leftRail:[{id:'files',label:'Files',icon:'Files',global:true},{id:'search',label:'Search',icon:'Search',global:true},{id:'versions',label:'Versions',icon:'VersionsIcon',global:true}],
  rightRail:[{id:'design',label:'Document',icon:'FileText'}],
  header:{menus:['Project','Edit','View','Tools','Help'],views:[],
   /** Export hero (docs/concepts/hero-action-documents.md): opens the export popup; the chevron keeps Save a copy and Publish. */
   heroAction:{id:'documents.export.open',labelKey:'hero.export',icon:'Download',menu:['documents.saveCopy']}},
  bottomBar:{slots:['zoom'],viewportPresets:[]},
  inspector:'documents.inspector',tools:[]
 },commands:[{id:'documents.saveCopy',label:'cmd.documents.saveCopy'},{id:'documents.zoomIn',label:'cmd.documents.zoomIn'},{id:'documents.zoomOut',label:'cmd.documents.zoomOut'}],
 shortcuts:{'studio.documents':'Mod+2'},menus:{view:[]},canvas:'documents.canvas',shellV2:documentsShell,
 agentV2:{tools:['documents_inspect_block','documents_propose_block'],contextProviders:['activeDocument'],quickActions:[]},agent:{tools:['documents_inspect_block','documents_propose_block'],contextProviders:['activeDocument'],quickActions:[]},deriveContext:context=>context,lifecycle:()=>getRegisteredLifecycleAdapter('documents')
};
registerStudio(documentsStudio);
registerDocumentsRailIcons();
