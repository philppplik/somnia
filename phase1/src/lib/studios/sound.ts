import {registerStudio,type StudioDef} from './registry';
import type {StudioShellDef,StudioLayout} from '../shell/types';
/** Pure data. React hosts are registered by components/sound/registerShell.ts. */
export const SOUND_LAYOUT:StudioLayout={leftOpen:true,rightOpen:true,leftWidth:260,rightWidth:320,leftPanels:['clips'],rightPanels:['inspector'],activeLeft:'clips',activeRight:'inspector'};
export const soundShell:StudioShellDef={
 panels:[
  {id:'files',title:'Files',titleKey:'sound.shell.files',component:'code.files',side:'left'},
  {id:'clips',title:'Audio clips',titleKey:'sound.shell.clips',component:'sound.clips',side:'left',commands:['sound.clip.activate']},
  {id:'selection',title:'Selection',titleKey:'sound.selection',component:'sound.selection',side:'left',commands:['sound.selection.set','sound.selection.all','sound.selection.clear','sound.region.apply','sound.region.clear']},
  {id:'effects',title:'Effects',titleKey:'sound.shell.effects',component:'sound.effects',side:'right',commands:['sound.settings.set']},
  {id:'inspector',title:'Audio inspector',titleKey:'sound.shell.inspector',component:'shell.inspector',side:'right',defaultOpen:true},
 ],
 leftRail:[
  {id:'files',icon:'Files',label:'Files',labelKey:'sound.shell.files',kind:'panel',panel:'files',order:10,defaultPinned:true},
  {id:'clips',icon:'AudioWaveform',label:'Audio clips',labelKey:'sound.shell.clips',kind:'panel',panel:'clips',order:20,defaultPinned:true},
  {id:'selection',icon:'Scissors',label:'Selection',labelKey:'sound.selection',kind:'panel',panel:'selection',order:30,defaultPinned:true},
 ],
 rightRail:[
  {id:'inspector',icon:'Volume2',label:'Audio inspector',labelKey:'sound.shell.inspector',kind:'panel',panel:'inspector',order:10,defaultPinned:true},
  {id:'effects',icon:'SlidersHorizontal',label:'Effects',labelKey:'sound.shell.effects',kind:'panel',panel:'effects',order:20,defaultPinned:true},
 ],
 inspector:{titleKey:'sound.shell.inspector',emptyKey:'sound.start.title',sections:[
  {id:'source',title:'Source audio',titleKey:'sound.shell.source',component:'sound.inspector.source',order:10},
  {id:'levels',title:'Levels and fades',titleKey:'sound.shell.levels',component:'sound.inspector.levels',when:'services.ready',order:20,commands:['sound.settings.set']},
  {id:'processing',title:'Processing',titleKey:'sound.shell.processing',component:'sound.inspector.processing',when:'services.ready',order:30,commands:['sound.settings.reset','sound.listen','sound.export']},
 ]},
 menus:[
  {menu:'Project',command:'sound.export.open',group:'sound.export',order:10},
  {menu:'Edit',command:'sound.selection.all',group:'sound.selection',order:10},
  {menu:'Edit',command:'sound.selection.clear',group:'sound.selection',order:20},
  {menu:'Edit',command:'sound.settings.reset',group:'sound.processing',order:30},
  {menu:'View',command:'sound.transport.toggle',group:'sound.transport',order:10},
 ],defaultLayout:SOUND_LAYOUT,
};
export const soundStudio:StudioDef={
 id:'sound',label:'studio.sound',icon:'AudioWaveform',order:4,
 formats:['mp3','wav','flac','ogg','oga','aif','aiff'].map(ext=>({ext,priority:10})),
 shell:{leftRail:[{id:'files',label:'Files',icon:'Files',global:true}],rightRail:[],header:{menus:['Project','Edit','View','Tools','Help'],views:[],heroAction:{id:'sound.export.open',labelKey:'sound.hero.export',icon:'AudioWaveform'}},bottomBar:{slots:[],viewportPresets:[]},inspector:'sound.inspector',tools:[]},
 commands:[],shortcuts:{'studio.sound':'Mod+5'},menus:{view:[]},canvas:'sound.canvas',shellV2:soundShell,
 agent:{tools:['sound_inspect','sound_propose_settings'],contextProviders:['activeDocument'],quickActions:[]},deriveContext:context=>context,
};
registerStudio(soundStudio);
