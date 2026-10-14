import {registerStudio,type StudioDef} from './registry';
import type {StudioShellDef} from '../shell/types';
/** Pure-data shell for the Animation studio (concept docs/concepts/animation-studio.md, phase P0). Hosts are registered by components/animation/registerShell.ts. */
export const animationShell:StudioShellDef={
 panels:[
  {id:'files',title:'Files',titleKey:'animation.shell.files',component:'code.files',side:'left'},
  {id:'compositions',title:'Compositions',titleKey:'animation.shell.compositions',component:'animation.compositions',side:'left',commands:['animation.comp.add','animation.comp.select','animation.layer.add','animation.project.new','animation.project.recover']},
  {id:'inspector',title:'Animation',titleKey:'animation.shell.inspector',component:'shell.inspector',side:'right',defaultOpen:true},
 ],
 leftRail:[
  {id:'files',icon:'Files',label:'Files',labelKey:'animation.shell.files',kind:'panel',panel:'files',order:10,defaultPinned:true},
  {id:'compositions',icon:'Layers',label:'Compositions',labelKey:'animation.shell.compositions',kind:'panel',panel:'compositions',order:20,defaultPinned:true},
 ],
 rightRail:[{id:'inspector',icon:'SlidersHorizontal',label:'Animation',labelKey:'animation.shell.inspector',kind:'panel',panel:'inspector',order:10,defaultPinned:true}],
 inspector:{titleKey:'animation.shell.inspector',emptyKey:'animation.shell.empty',emptyWhen:'!services.ready',sections:[
  {id:'properties',title:'Properties',titleKey:'animation.shell.properties',component:'animation.inspector.properties',when:"selection.kind == 'one'",order:10,commands:['animation.layer.update','animation.prop.set','animation.prop.animate','animation.key.add','animation.key.remove','animation.key.interp']},
  {id:'composition',title:'Composition',titleKey:'animation.shell.composition',component:'animation.inspector.composition',when:'services.ready',order:20,commands:['animation.comp.update']},
  {id:'render',title:'Render',titleKey:'animation.shell.render',component:'animation.inspector.render',when:'services.renderSetup',order:30,commands:['animation.render.close','animation.export.frame','animation.export.sequence']},
 ]},
 defaultLayout:{leftOpen:true,rightOpen:true,leftWidth:260,rightWidth:320,leftPanels:['compositions'],rightPanels:['inspector'],activeLeft:'compositions',activeRight:'inspector'},
 menus:[
  {menu:'Project',command:'animation.project.new',group:'animation',order:10},
  {menu:'Project',command:'animation.project.recover',group:'animation',order:20},
  {menu:'Project',command:'animation.render.open',group:'animation',order:80},
  {menu:'Edit',command:'animation.edit.undo',group:'animation',order:10},
  {menu:'Edit',command:'animation.edit.redo',group:'animation',order:20},
  {menu:'Edit',command:'animation.layer.remove',group:'animation',order:30},
  {menu:'Edit',command:'animation.keys.copy',group:'animation-keys',order:10},
  {menu:'Edit',command:'animation.keys.cut',group:'animation-keys',order:20},
  {menu:'Edit',command:'animation.keys.paste',group:'animation-keys',order:30},
  {menu:'Edit',command:'animation.keys.delete',group:'animation-keys',order:40},
  {menu:'Edit',command:'animation.keys.selectAll',group:'animation-keys',order:50},
  {menu:'Edit',command:'animation.keys.easeAll',group:'animation-keys',order:60},
  {menu:'Edit',command:'animation.layers.stagger',group:'animation-keys',order:70},
  {menu:'View',command:'animation.graph.toggle',group:'animation',order:10},
  {menu:'View',command:'animation.playback.loop',group:'animation',order:20},
  {menu:'View',command:'animation.workarea.in',group:'animation-workarea',order:30},
  {menu:'View',command:'animation.workarea.out',group:'animation-workarea',order:40},
  {menu:'View',command:'animation.workarea.reset',group:'animation-workarea',order:50},
  {menu:'Project',command:'animation.export.frame',group:'animation',order:90},
  {menu:'Project',command:'animation.export.sequence',group:'animation',order:100},
  {menu:'Insert',command:'animation.comp.add',group:'animation',order:10},
 ],
};
export const animationStudio:StudioDef={
 id:'animation',label:'studio.animation',icon:'Sparkles',order:11,
 // No file claims in P0: the `.somnia` entry schema is an open decision in the concept (section 11).
 formats:[],
 shell:{leftRail:[{id:'files',label:'Files',icon:'Files',global:true}],rightRail:[],header:{menus:['Project','Edit','View','Insert','Help'],views:[],
  heroAction:{id:'animation.render.open',labelKey:'animation.hero.render',icon:'Film'}},bottomBar:{slots:[],viewportPresets:[]},inspector:'animation.inspector',tools:[]},
 // No global shortcut yet: allocation waits for the global shortcut inventory check (concept section 3).
 commands:[],shortcuts:{},menus:{view:[]},canvas:'animation.canvas',shellV2:animationShell,
 agent:{tools:[],contextProviders:['activeDocument'],quickActions:[]},deriveContext:context=>context
};
registerStudio(animationStudio);
