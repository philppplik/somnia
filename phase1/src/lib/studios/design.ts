import {registerBlankProjectFactory} from './blank';
import {startDesign} from '../design/session';
import {registerStudio,type StudioDef} from './registry';
import type {InspectorDef,MenuItemDef,PanelDef,RailItemDef,StudioLayout,StudioShellDef,ToolDef} from '../shell/types';
import '../design/shellRail';
/**
 * Design studio manifest (pure data). Hosts live in components/design/registerShell.ts.
 * Left: Files, Layers (outline of the active artboard), Artboards (list, sizes, presets), Colours (document palette),
 * Search, Versions, then the canvas tools (Select, Hand, Rectangle, Text, Artboard). Right: the generic inspector with
 * Selection, Arrange, Artboard and Project sections. The canvas publishes `selection` (layer ids of the active artboard),
 * `activeTool`, `data.{artboardId,artboards,layers}` and `services.{ready,layers,align,distribute,multiBoard}`.
 */
const left=(id:string,component:string,title:string,titleKey:string,extra:Partial<PanelDef>={}):PanelDef=>({id,title,titleKey,component,side:'left',...extra});
export const designPanels:readonly PanelDef[]=[
 left('files','code.files','Files','design.rail.files'),
 left('layers','design.layers','Layers','design.rail.layers',{commands:['design.layer.front','design.layer.forward','design.layer.backward','design.layer.back','design.layer.toggleVisible','design.layer.toggleLocked','design.duplicateSelection','design.deleteSelection']}),
 left('artboards','design.artboards','Artboards','design.rail.artboards',{commands:['design.artboard.add','design.artboard.duplicate','design.artboard.delete','design.artboard.select','design.artboard.moveUp','design.artboard.moveDown','design.artboard.rename']}),
 left('colors','design.colors','Colours','design.rail.colors',{commands:['design.color.apply']}),
 left('search','code.search','Search','design.rail.search'),
 left('versions','code.versions','Versions','design.rail.versions'),
 {id:'inspector',title:'Properties',titleKey:'design.rail.inspector',component:'shell.inspector',side:'right',defaultOpen:true},
];
const panelItem=(id:string,icon:string,label:string,order:number,extra:Partial<RailItemDef>={}):RailItemDef=>({id,icon,label,labelKey:`design.rail.${id}`,kind:'panel',panel:id,order,...extra});
const toolItem=(id:string,icon:string,label:string,order:number):RailItemDef=>({id:`tool-${id}`,icon,label,labelKey:`design.tool.${id}`,kind:'tool',tool:id,order,when:'services.ready'});
export const designLeftRail:readonly RailItemDef[]=[
 panelItem('files','Files','Files',10),
 panelItem('layers','DesignLayers','Layers',20),
 panelItem('artboards','DesignArtboards','Artboards',30),
 panelItem('colors','DesignColors','Colours',40),
 panelItem('search','Search','Search',50,{defaultPinned:false}),
 panelItem('versions','VersionsIcon','Versions',60,{defaultPinned:false}),
 toolItem('select','DesignSelect','Select',100),
 toolItem('hand','DesignHand','Hand',110),
 toolItem('rectangle','DesignRectangle','Rectangle',120),
 toolItem('text','DesignText','Text',130),
 toolItem('frame','DesignArtboardTool','Artboard',140),
];
export const designRightRail:readonly RailItemDef[]=[panelItem('inspector','DesignInspector','Properties',10)];
export const designTools:readonly ToolDef[]=[
 {id:'select',command:'design.tool.select',icon:'DesignSelect'},
 {id:'hand',command:'design.tool.hand',icon:'DesignHand'},
 {id:'rectangle',command:'design.tool.rectangle',icon:'DesignRectangle'},
 {id:'text',command:'design.tool.text',icon:'DesignText'},
 {id:'frame',command:'design.tool.frame',icon:'DesignArtboardTool',opensPanel:'artboards'},
];
export const designInspector:InspectorDef={titleKey:'design.rail.inspector',emptyKey:'design.shell.empty',sections:[
 {id:'selection',title:'Selection',titleKey:'design.section.selection',component:'design.inspector.selection',when:'services.ready',order:10},
 {id:'arrange',title:'Arrange',titleKey:'design.section.arrange',component:'design.inspector.arrange',when:"selection.kind != 'none'",order:20,commands:['design.layer.front','design.layer.forward','design.layer.backward','design.layer.back','design.nudge']},
 {id:'artboard',title:'Artboard',titleKey:'design.section.artboard',component:'design.inspector.artboard',when:'services.ready',order:30,commands:['design.artboard.preset','design.artboard.resize','design.artboard.rotate','design.artboard.rename','design.color.apply']},
 {id:'project',title:'Project',titleKey:'design.section.project',component:'design.inspector.project',when:'services.ready',order:40,defaultCollapsed:true,commands:['design.rename','design.exportProject','design.exportSvg']},
]};
export const DESIGN_LAYOUT:StudioLayout={leftOpen:true,rightOpen:true,leftWidth:268,rightWidth:320,leftPanels:['layers'],rightPanels:['inspector'],activeLeft:'layers',activeRight:'inspector'};
const m=(menu:MenuItemDef['menu'],command:string,group:string,order:number,extra:Partial<MenuItemDef>={}):MenuItemDef=>({menu,command,group,order,...extra});
export const designMenus:readonly MenuItemDef[]=[
 m('Project','design.new','new',10),m('Project','design.exportProject','export',10),m('Project','design.exportSvg','export',20),m('Project','design.rename','project',10),
 m('Edit','design.undo','history',10),m('Edit','design.redo','history',20),
 m('Edit','design.selectAll','select',10),m('Edit','design.deselect','select',20),
 m('Edit','design.duplicateSelection','layer',10),m('Edit','design.deleteSelection','layer',20),
 m('Edit','design.layer.front','arrange',10),m('Edit','design.layer.forward','arrange',20),m('Edit','design.layer.backward','arrange',30),m('Edit','design.layer.back','arrange',40),
 m('Edit','design.layer.toggleVisible','state',10),m('Edit','design.layer.toggleLocked','state',20),
 m('Edit','design.alignSelection','align',10),m('Edit','design.distributeSelection','align',20),m('Edit','design.nudge','align',30),
 m('Edit','design.artboard.duplicate','artboard',10),m('Edit','design.artboard.delete','artboard',20),m('Edit','design.artboard.rotate','artboard',30),
 m('View','design.zoomIn','zoom',10),m('View','design.zoomOut','zoom',20),m('View','design.zoomReset','zoom',30),m('View','design.zoomFit','zoom',40),
 m('View','design.artboard.previous','artboards',10),m('View','design.artboard.next','artboards',20),
 m('Insert','design.addRectangle','layer',10),m('Insert','design.addText','layer',20),m('Insert','design.artboard.add','artboard',10),
 m('Tools','design.tool.select','tool',10),m('Tools','design.tool.hand','tool',20),m('Tools','design.tool.rectangle','tool',30),m('Tools','design.tool.text','tool',40),m('Tools','design.tool.frame','tool',50),
];
export const designShell:StudioShellDef={panels:designPanels,leftRail:designLeftRail,rightRail:designRightRail,tools:designTools,inspector:designInspector,defaultLayout:DESIGN_LAYOUT};
/** Commands that panels, the rail or the inspector trigger. Registered by registerDesignCommands while the canvas is mounted. */
export const DESIGN_SHELL_COMMANDS=[
 'design.tool.select','design.tool.hand','design.tool.rectangle','design.tool.text','design.tool.frame',
 'design.artboard.add','design.artboard.duplicate','design.artboard.delete','design.artboard.rename','design.artboard.select','design.artboard.next','design.artboard.previous','design.artboard.moveUp','design.artboard.moveDown','design.artboard.resize','design.artboard.preset','design.artboard.rotate',
 'design.color.apply','design.zoomIn','design.zoomOut','design.zoomReset','design.zoomFit','design.zoomSet','design.selectAll','design.deselect',
 'design.layer.front','design.layer.forward','design.layer.backward','design.layer.back','design.layer.toggleVisible','design.layer.toggleLocked','design.nudge','design.rename',
 'design.export.open','design.exportAllSvg','design.duplicateSelection','design.deleteSelection','design.alignSelection','design.distributeSelection','design.exportProject','design.exportSvg','design.new','design.undo','design.redo','design.addRectangle','design.addText','design.setTool','design.getState',
] as const;
/** Legacy header shape stays for the studio pill, formats and the unmigrated paths. */
export const designStudio:StudioDef={
 id:'design',label:'Design',icon:'LayoutTemplate',order:6,formats:[{ext:'somdesign',priority:100}],
 shell:{leftRail:[{id:'files',label:'Files',icon:'Files',global:true}],rightRail:[{id:'design',label:'Artboard and layers',icon:'SlidersHorizontal'}],header:{heroAction:{id:'design.export.open',labelKey:'design.hero.export',disabledLabelKey:'design.hero.disabled',icon:'Download',menu:['design.exportSvg','design.exportProject']},menus:['Project','Edit','View','Insert','Tools','Help'],views:[]},bottomBar:{slots:[],viewportPresets:[]},inspector:'design.inspector',tools:[]},
 commands:[],shortcuts:{},menus:{view:[]},canvas:'design.canvas',shellV2:{...designShell,menus:designMenus},
 agent:{tools:[],contextProviders:[],quickActions:[]},deriveContext:context=>context
};
registerStudio(designStudio);

registerBlankProjectFactory('design',startDesign);
