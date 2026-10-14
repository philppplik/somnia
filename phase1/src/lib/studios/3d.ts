import {registerStudio,type StudioDef} from './registry';
import type {StudioShellDef,StudioLayout,RailItemDef} from '../shell/types';
/** Pure data. Hosts are registered by components/studio3d/registerShell.ts. P0 spike: view, inspect, export. */
const rail=(id:string,icon:string,label:string,order:number):RailItemDef=>({id,icon,label,labelKey:`studio3d.shell.${id}`,kind:'panel',panel:id,order,defaultPinned:true});
export const STUDIO3D_LAYOUT:StudioLayout={leftOpen:true,rightOpen:true,leftWidth:260,rightWidth:300,leftPanels:['scene'],rightPanels:['inspector'],activeLeft:'scene',activeRight:'inspector'};
export const studio3DShell:StudioShellDef={
 panels:[
  {id:'scene',title:'Scene',titleKey:'studio3d.shell.scene',component:'studio3d.scene',side:'left',commands:['studio3d.select','studio3d.insert.primitive','studio3d.insert.light','studio3d.insert.camera','studio3d.gizmo.mode']},
  {id:'inspector',title:'3D inspector',titleKey:'studio3d.shell.inspector',component:'shell.inspector',side:'right',defaultOpen:true},
 ],
 leftRail:[rail('scene','Boxes','Scene',10)],
 rightRail:[rail('inspector','Info','3D inspector',10)],
 inspector:{titleKey:'studio3d.shell.inspector',emptyKey:'studio3d.start.title',sections:[
  {id:'model',title:'Model',titleKey:'studio3d.shell.model',component:'studio3d.inspector.model',order:10},
  {id:'object',title:'Selected object',titleKey:'studio3d.shell.object',component:'studio3d.inspector.object',order:20,commands:['studio3d.object.transform','studio3d.object.material','studio3d.object.rename','studio3d.object.delete','studio3d.object.duplicate','studio3d.object.nudge','studio3d.camera.set','studio3d.view.fromCamera','studio3d.light.set','studio3d.object.pivot']},
  {id:'tools',title:'Tools',titleKey:'studio3d.shell.tools',component:'studio3d.inspector.tools',order:22,commands:['studio3d.save','studio3d.selection.delete','studio3d.selection.duplicate','studio3d.snap.set','studio3d.export.mesh','studio3d.unit.set','studio3d.render.turntable','studio3d.render.cancel','studio3d.object.align','studio3d.object.distribute','studio3d.object.pivot']},
  {id:'env',title:'Environment',titleKey:'studio3d.shell.env',component:'studio3d.inspector.env',order:25,commands:['studio3d.env.set','studio3d.env.open']},
  {id:'view',title:'View',titleKey:'studio3d.shell.view',component:'studio3d.inspector.view',order:30,commands:['studio3d.view.grid','studio3d.view.wireframe','studio3d.view.reset','studio3d.view.frame']},
 ]},
 menus:[
  {menu:'Project',command:'studio3d.model.open',group:'studio3d.file',order:10},
  {menu:'Project',command:'studio3d.scene.new',group:'studio3d.file',order:20},
  {menu:'Project',command:'studio3d.save',group:'studio3d.save',order:10},
  {menu:'Project',command:'studio3d.export.glb',group:'studio3d.export',order:30},
  {menu:'Project',command:'studio3d.render.turntable',group:'studio3d.export',order:40},
  {menu:'Project',command:'studio3d.render.still',group:'studio3d.export',order:40},
  {menu:'Edit',command:'studio3d.undo',group:'studio3d.history',order:10},
  {menu:'Edit',command:'studio3d.redo',group:'studio3d.history',order:20},
  {menu:'Edit',command:'studio3d.object.duplicate',group:'studio3d.object',order:30},
  {menu:'Edit',command:'studio3d.object.delete',group:'studio3d.object',order:40},
  {menu:'Insert',command:'studio3d.insert.primitive',group:'studio3d.insert',order:10},
  {menu:'Insert',command:'studio3d.insert.light',group:'studio3d.insert',order:20},
  {menu:'Insert',command:'studio3d.insert.camera',group:'studio3d.insert',order:30},
  {menu:'Tools',command:'studio3d.gizmo.mode',group:'studio3d.tools',order:10},
  {menu:'Tools',command:'studio3d.snap.set',group:'studio3d.tools',order:20},
  {menu:'View',command:'studio3d.env.open',group:'studio3d.env',order:50},
  {menu:'View',command:'studio3d.view.reset',group:'studio3d.view',order:10},
  {menu:'View',command:'studio3d.view.frame',group:'studio3d.view',order:20},
  {menu:'View',command:'studio3d.view.grid',group:'studio3d.view',order:30},
  {menu:'View',command:'studio3d.view.wireframe',group:'studio3d.view',order:40},
 ],defaultLayout:STUDIO3D_LAYOUT,
};
/** Order 9 keeps Vibe Space last. Smart Open routes .glb, .gltf, .obj, .stl and .ply here (open handler `open.3d`, kind `model3d`). */
export const studio3D:StudioDef={
 id:'3d',label:'studio.3d',icon:'Boxes',order:9,formats:[{ext:'glb',priority:100},{ext:'gltf',priority:100},{ext:'obj',priority:100},{ext:'stl',priority:100},{ext:'ply',priority:100}],
 shell:{leftRail:[],rightRail:[],header:{menus:['Project','Edit','View','Insert','Tools','Help'],views:[],heroAction:{id:'studio3d.render.still',labelKey:'studio3d.hero.render',icon:'Image'}},bottomBar:{slots:[],viewportPresets:[]},inspector:'studio3d.inspector',tools:[]},
 commands:[],shortcuts:{},menus:{view:[]},canvas:'studio3d.canvas',shellV2:studio3DShell,
 agent:{tools:[],contextProviders:[],quickActions:[]},deriveContext:context=>context,
};
registerStudio(studio3D);
