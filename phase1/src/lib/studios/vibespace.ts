import {registerStudio,type StudioDef} from './registry';
/** Agent workspace: no file claims, conversion, or document editor takeover. */
export const vibespaceStudio:StudioDef={
 id:'vibespace',label:'studio.vibespace',icon:'Bot',order:10,formats:[],
 shell:{leftRail:[],rightRail:[],header:{menus:['Project','View','Tools','Help'],views:[]},
  bottomBar:{slots:[],viewportPresets:[]},inspector:'vibespace.inspector',tools:[]},
 commands:[],shortcuts:{},menus:{view:[]},canvas:'vibespace.canvas',
 agent:{tools:[],contextProviders:[],quickActions:[]},deriveContext:context=>context
};
registerStudio(vibespaceStudio);
