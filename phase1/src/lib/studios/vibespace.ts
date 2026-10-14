import {registerStudio,type StudioDef} from './registry';
import type {StudioShellDef,StudioLayout,RailItemDef} from '../shell/types';
const rail=(id:string,icon:string,label:string,order:number,defaultPinned=true):RailItemDef=>({id,icon,label,labelKey:`vibespace.shell.${id}`,kind:'panel',panel:id,order,defaultPinned});
export const VIBESPACE_LAYOUT:StudioLayout={leftOpen:true,rightOpen:true,leftWidth:260,rightWidth:300,leftPanels:['spaces'],rightPanels:['inspector'],activeLeft:'spaces',activeRight:'inspector'};
export const vibespaceShell:StudioShellDef={
 panels:[
  {id:'spaces',title:'Vibe Spaces',titleKey:'vibespace.shell.spaces',component:'vibespace.spaces',side:'left',commands:['vibespace.space.select','vibespace.space.new','vibespace.refresh']},
  {id:'runs',title:'Studio runs',titleKey:'vibespace.shell.runs',component:'vibespace.runs',side:'left',commands:['vibespace.run.open','vibespace.studio.new']},
  {id:'attention',title:'Needs review',titleKey:'vibespace.shell.attention',component:'vibespace.attention',side:'left',commands:['vibespace.run.open']},
  {id:'memory',title:'Memory',titleKey:'vibespace.shell.memory',component:'vibespace.memory',side:'right',when:'services.space && services.native'},
  {id:'skills',title:'Skills',titleKey:'vibespace.shell.skills',component:'vibespace.skills',side:'right',when:'services.space && services.native'},
  {id:'inspector',title:'Vibe Space',titleKey:'vibespace.shell.inspector',component:'shell.inspector',side:'right'},
 ],
 leftRail:[rail('spaces','Bot','Vibe Spaces',10),rail('runs','LayoutTemplate','Studio runs',20),rail('attention','AlertTriangle','Needs review',30)],
 rightRail:[rail('inspector','Info','Vibe Space',10),{...rail('memory','Lightbulb','Memory',20),when:'services.space && services.native'},{...rail('skills','Puzzle','Skills',30,false),when:'services.space && services.native'}],
 inspector:{titleKey:'vibespace.shell.inspector',emptyKey:'vibespace.shell.empty',sections:[
  {id:'space',title:'Space',titleKey:'vibespace.shell.space',component:'vibespace.inspector.space',order:10},
  {id:'run',title:'Selected run',titleKey:'vibespace.shell.run',component:'vibespace.inspector.run',when:"selection.kind == 'one'",order:20},
  {id:'usage',title:'Usage',titleKey:'vibespace.shell.usage',component:'vibespace.inspector.usage',when:'services.usage',order:30},
  {id:'checkpoints',title:'Checkpoints',titleKey:'vibespace.shell.checkpoints',component:'vibespace.inspector.checkpoints',when:'services.checkpoints',order:40,defaultCollapsed:true},
 ]},defaultLayout:VIBESPACE_LAYOUT,
 menus:[{menu:'View',command:'vibespace.home',group:'vibespace',order:10},{menu:'View',command:'vibespace.refresh',group:'vibespace',order:20},{menu:'Project',command:'vibespace.space.new',group:'vibespace',order:10},{menu:'Project',command:'vibespace.studio.new',group:'vibespace',order:20}],
};
/** Agent workspace: no file claims, conversion, or document editor takeover. */
export const vibespaceStudio:StudioDef={
 id:'vibespace',label:'studio.vibespace',icon:'Bot',order:12,formats:[],
 shell:{leftRail:[],rightRail:[],header:{menus:['Project','View','Tools','Help'],views:[],heroAction:{id:'vibespace.task.new',labelKey:'vibespace.hero.task',icon:'Plus'}},bottomBar:{slots:[],viewportPresets:[]},inspector:'vibespace.inspector',tools:[]},
 commands:[],shortcuts:{},menus:{view:[]},canvas:'vibespace.canvas',shellV2:vibespaceShell,
 agent:{tools:[],contextProviders:[],quickActions:[]},deriveContext:context=>context
};
registerStudio(vibespaceStudio);
