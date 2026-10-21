import {getRegisteredLifecycleAdapter} from '../lifecycle/adapters';
import {registerStudio,type StudioDef} from './registry';
import type {StudioShellDef} from '../shell/types';
/** Pure-data shell. Video panel hosts are registered by components/video/registerShell.ts. */
export const videoShell:StudioShellDef={
 panels:[
  {id:'files',title:'Files',titleKey:'video.shell.files',component:'code.files',side:'left'},
  {id:'sources',title:'Sources',titleKey:'video.shell.sources',component:'video.sources',side:'left',commands:['video.source.add','video.source.open']},
  {id:'sequence',title:'Sequence',titleKey:'video.shell.sequence',component:'video.sequence',side:'left',commands:['video.clip.select','video.timeline.split','video.title.add','video.timeline.reset']},
  {id:'inspector',title:'Video',titleKey:'video.shell.inspector',component:'shell.inspector',side:'right',defaultOpen:true},
 ],
 leftRail:[
  {id:'files',icon:'Files',label:'Files',labelKey:'video.shell.files',kind:'panel',panel:'files',order:10,defaultPinned:true},
  {id:'sources',icon:'Film',label:'Sources',labelKey:'video.shell.sources',kind:'panel',panel:'sources',order:20,defaultPinned:true},
  {id:'sequence',icon:'Layers',label:'Sequence',labelKey:'video.shell.sequence',kind:'panel',panel:'sequence',order:30,defaultPinned:true},
  {id:'addTitle',icon:'Type',label:'Add title card',labelKey:'video.card.add',kind:'command',command:'video.title.add',order:40,when:'services.ready',defaultPinned:false},
 ],
 rightRail:[{id:'inspector',icon:'SlidersHorizontal',label:'Video',labelKey:'video.shell.inspector',kind:'panel',panel:'inspector',order:10,defaultPinned:true}],
 inspector:{titleKey:'video.shell.inspector',emptyKey:'video.shell.empty',sections:[
  {id:'document',title:'Source information',titleKey:'video.facts',component:'video.inspector.document',order:10},
  {id:'selection',title:'Selected clip',titleKey:'video.shell.selected',component:'video.inspector.selection',when:"selection.kind == 'one'",order:20,commands:['video.clip.trim','video.clip.move','video.clip.delete','video.clip.deselect','video.title.update','video.title.duration']},
  {id:'audio',title:'Audio and transition',titleKey:'video.shell.audio',component:'video.inspector.audio',when:"selection.kind == 'one'",order:30,commands:['video.clip.gain','video.clip.mute','video.clip.crossfade']},
  {id:'export',title:'Export copy',titleKey:'video.export',component:'video.inspector.export',when:'services.ready || services.exporting',order:40,commands:['video.export.format','video.export.start','video.export.cancel']},
 ]},
 defaultLayout:{leftOpen:true,rightOpen:true,leftWidth:260,rightWidth:320,leftPanels:['sources'],rightPanels:['inspector'],activeLeft:'sources',activeRight:'inspector'},
 menus:[
  {menu:'Insert',command:'video.title.add',group:'video',order:10},
  {menu:'Tools',command:'video.source.open',group:'video',order:10},
  {menu:'Edit',command:'video.clip.delete',group:'video',order:10},
  {menu:'Edit',command:'video.timeline.reset',group:'video',order:20},
  {menu:'Project',command:'video.export.open',group:'video',order:80},
  {menu:'Project',command:'video.export.cancel',group:'video',order:90},
 ],
};
export const videoStudio:StudioDef={
 lifecycle:()=>getRegisteredLifecycleAdapter('video'),
 id:'video',label:'studio.video',icon:'Film',order:5,
 formats:['mp4','m4v','mov','webm','mkv'].map(ext=>({ext,priority:10})),
 shell:{leftRail:[{id:'files',label:'Files',icon:'Files',global:true}],rightRail:[],header:{menus:['Project','Edit','View','Tools','Help'],views:[],heroAction:{id:'video.export.open',labelKey:'video.hero.export',icon:'Film',variants:[{when:'services.exporting',id:'video.export.open',labelKey:'video.hero.exporting',icon:'Film'}]}},bottomBar:{slots:[],viewportPresets:[]},inspector:'video.inspector',tools:[]},
 commands:[],shortcuts:{'studio.video':'Mod+6'},menus:{view:[]},canvas:'video.canvas',shellV2:videoShell,
 agent:{tools:[],contextProviders:['activeDocument'],quickActions:[]},deriveContext:context=>context,lifecycle:()=>getRegisteredLifecycleAdapter('video')
};
registerStudio(videoStudio);
