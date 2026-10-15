import {registerStudio,type StudioDef} from './registry';
import type {StudioShellDef} from '../shell/types';
export const VECTOR_TOOLS=['select','node','pen','rect','ellipse','line','polygon','star','text'] as const;
const toolIcons=['MousePointer2','VectorNode','VectorPen','Square','VectorEllipse','VectorLine','VectorPolygon','VectorStar','Type'];
export const vectorShell:StudioShellDef={
 panels:[
  {id:'files',title:'Files',component:'code.files',side:'left'},
  {id:'layers',title:'Layers',titleKey:'vector.layers',component:'vector.layers',side:'left',commands:['vector.select','vector.toggleHidden','vector.toggleLocked','vector.renamePath','vector.renameGroup','vector.reorder']},
  {id:'tools',title:'Tools',titleKey:'vector.toolbar',component:'vector.tools',side:'left',commands:['vector.setTool']},
  {id:'export',title:'Export',titleKey:'vector.hero.export',component:'vector.export',side:'right',commands:['vector.exportSvg','vector.exportPng','vector.importSvg','vector.clearError']},
  {id:'inspector',title:'Vector',titleKey:'vector.inspector',component:'shell.inspector',side:'right',defaultOpen:true},
 ],
 leftRail:[
  {id:'files',icon:'Files',label:'Files',kind:'panel',panel:'files',order:10},
  {id:'layers',icon:'Layers',label:'Layers',labelKey:'vector.layers',kind:'panel',panel:'layers',order:20},
  {id:'tools',icon:'Pencil',label:'Tools',labelKey:'vector.toolbar',kind:'panel',panel:'tools',order:30},
  ...VECTOR_TOOLS.map((tool,i)=>({id:tool,icon:toolIcons[i],label:tool,labelKey:'vector.tool.'+tool,kind:'tool' as const,tool,order:40+i*10,when:'services.ready',defaultPinned:i<3})),
 ],
 rightRail:[
  {id:'inspector',icon:'SlidersHorizontal',label:'Vector',labelKey:'vector.inspector',kind:'panel',panel:'inspector',order:10},
  {id:'export',icon:'VectorExport',label:'Export',labelKey:'vector.file',kind:'panel',panel:'export',order:20},
 ],
 tools:VECTOR_TOOLS.map((tool,i)=>({id:tool,command:'vector.tool.'+tool,icon:toolIcons[i],opensPanel:'tools'})),
 inspector:{emptyKey:'vector.shell.empty',sections:[
  {id:'page',title:'Page',titleKey:'vector.page',component:'vector.section.page',order:10,when:'services.ready',commands:['vector.resizePage','vector.replaceDocument','vector.moveGuide','vector.clearGuides']},
  {id:'transform',title:'Transform',titleKey:'vector.shell.transform',component:'vector.section.transform',order:20,when:"selection.kind != 'none'",commands:['vector.setSelectionBounds','vector.rotateSelection','vector.flipSelection','vector.alignSelection','vector.distributeSelection','vector.booleanOp','vector.group','vector.ungroup','vector.joinPaths','vector.reversePath','vector.roundCorners','vector.simplifyPath','vector.makeClip','vector.releaseClip','vector.copyStyle','vector.pasteStyle','vector.offsetPath','vector.outlineStroke','vector.reorder','vector.duplicateSelection','vector.deleteSelection']},
  {id:'style',title:'Style',titleKey:'vector.style',component:'vector.section.style',order:30,when:"selection.kind != 'none'",commands:['vector.setStyle','vector.setGradient','vector.addSwatch','vector.removeSwatch','vector.applySwatch']},
  {id:'text',title:'Text',titleKey:'vector.shell.text',component:'vector.section.text',order:35,when:'services.ready',commands:['vector.addText','vector.setText','vector.deleteText']},
  {id:'nodes',title:'Nodes',titleKey:'vector.tool.node',component:'vector.section.nodes',order:40,when:'services.node',commands:['vector.moveNode','vector.setNodeKind','vector.splitPath','vector.deleteNode','vector.toggleClosed']},
 ]},
 defaultLayout:{leftOpen:true,rightOpen:true,leftWidth:260,rightWidth:300,leftPanels:['layers'],rightPanels:['inspector'],activeLeft:'layers',activeRight:'inspector'},
};

/** Vector Studio: path and shape engine on the vectorio document model, node editing, strict SVG import and clean SVG/PNG export. */
export const vectorStudio:StudioDef={
 id:'vector',label:'studio.vector',icon:'Pencil',order:7,
 formats:[{ext:'svg',priority:5}],
 shell:{
  leftRail:[{id:'files',label:'Files',icon:'Files',global:true}],
  rightRail:[],
  header:{heroAction:{id:'vector.export.open',labelKey:'vector.hero.export',disabledLabelKey:'vector.hero.disabled',icon:'VectorExport',menu:['vector.exportSvg','vector.exportPng']},menus:['Project','Edit','View','Tools','Help'],views:[]},
  bottomBar:{slots:['zoom'],viewportPresets:[]},
  inspector:'vector.inspector',tools:[]
 },
 shellV2:vectorShell,commands:[],shortcuts:{'studio.vector':'Mod+8'},menus:{view:[]},canvas:'vector.canvas',
 agent:{tools:[],contextProviders:['activeDocument'],quickActions:[]},deriveContext:context=>context
};
registerStudio(vectorStudio);
