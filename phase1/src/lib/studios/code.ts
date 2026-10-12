import {registerStudio,type StudioDef} from './registry';
import type {MenuId,MenuItemDef} from '../shell/types';
/**
 * M2: today's Code studio menus expressed as MenuItemDef[] (studio shell v2, concept section 4.2/8).
 * Placement only: titles, shortcuts and enabled flags still come from the command registry at render
 * time, so i18n, scoped overrides and user shortcut overrides keep working. One group per menu,
 * because the current menus render without separators; the order inside each group is the registry
 * order the category-based menu used before. Commands registered dynamically at runtime that are
 * not listed here (e.g. recovery entries) still appear via the dynamic tail in buildMenuModel.
 */
const codeMenuTable:Record<MenuId,readonly string[]>={
 Project:['project.saveAll','project.closeAll','project.export','project.openFile','project.openMedia','project.newFile','project.export.md','project.open','project.reconnect','project.save','project.close','vector.createBlank','vector.openSvg'],
 Edit:['edit.undo','edit.redo','edit.duplicate','edit.delete','edit.encodeEntities','edit.decodeEntities','edit.format','edit.wrap','edit.unwrap','vector.undo','vector.redo','vector.deleteSelection','vector.duplicateSelection','vector.moveSelection','vector.setStyle','vector.renamePath','vector.toggleHidden','vector.reorder','vector.setSelectionBounds','vector.resizePage','vector.moveNode','vector.deleteNode','vector.setNodeKind','vector.toggleClosed','vector.replaceDocument'],
 View:['search.project','css.open','sidebar.toggle','agent.toggle','chat.toggle','inspector.toggle','split.vertical','split.horizontal','split.swap','zoom.in','zoom.out','zoom.reset','theme.light','theme.dark','view.livePreview','view.toggleCodeDesign','panels.hideAll','tab.close','tab.next','tab.prev','extensions.open','vector.setTool','vector.select','vector.setView','vector.clearError','vector.selectNode'],
 Insert:['insert.element.0','insert.element.1','insert.element.2','insert.element.3','insert.element.4','insert.element.5','insert.element.6','insert.element.7','insert.element.8','insert.element.9','table.insert','table.row.above','table.row.below','table.row.delete','table.col.left','table.col.right','table.col.delete','table.header','table.merge','md.bold','md.italic','md.code','md.strike','md.bullet','md.task','md.number','md.quote','md.codeblock','md.table','md.h1','md.h2','md.h3','md.h4','md.h5','md.h6','md.reveal','md.sync','vector.importSvg','vector.addPath','vector.addNodeNear'],
 Tools:['palette.open','problems.toggle','theme.toggle','tools.diff','tools.editImage','tools.convert','experimental.fastParse','settings.open','collab.share','collab.join','project.compare','vector.inspect','vector.toSvg'],
 Help:['help.errorReport','help.github','help.shortcuts'],
};
export const codeMenuDefs:MenuItemDef[]=(Object.entries(codeMenuTable) as [MenuId,readonly string[]][]).flatMap(([menu,ids])=>ids.map((command,i)=>({menu,command,group:menu.toLowerCase()+'.main',order:(i+1)*10})));
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
 shortcuts:{'studio.code':'Mod+1','view.design':'Mod+Alt+1','view.split':'Mod+Alt+2','view.code':'Mod+Alt+3'},menus:{view:['view.design','view.split','view.code']},shellV2:{menus:codeMenuDefs},canvas:'code.canvas',
 agent:{tools:[],contextProviders:['activeDocument','selection'],quickActions:[]},deriveContext:context=>context
};
registerStudio(codeStudio);
