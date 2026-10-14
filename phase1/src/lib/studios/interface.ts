import {registerStudio,type StudioDef} from './registry';
import {registerBlankProjectFactory} from './blankRegistry';
import {startInterface} from '../interface/session';
import {INTERFACE_COMMANDS} from '../interface/commands';
export const interfaceStudio:StudioDef={
 id:'interface',label:'studio.interface',icon:'LayoutTemplate',order:10,formats:[],
 shell:{leftRail:[],rightRail:[],header:{menus:['Project','Edit','View','Insert','Tools','Help'],views:[],heroAction:{id:'interface.save',labelKey:'interface.save',icon:'Download',when:"studio == 'interface'"}},bottomBar:{slots:[],viewportPresets:[]},inspector:'interface.properties',tools:[]},
 commands:[],shortcuts:{},menus:{view:[]},canvas:'interface.canvas',agent:{tools:[],contextProviders:[],quickActions:[]},deriveContext:context=>context,
 shellV2:{
  panels:[{id:'layers',title:'Pages and layers',titleKey:'interface.layers',component:'interface.layers',side:'left',defaultOpen:true},{id:'properties',title:'Properties',titleKey:'interface.properties',component:'interface.properties',side:'right',defaultOpen:true}],
  leftRail:[{id:'layers',label:'Pages and layers',labelKey:'interface.layers',icon:'DesignLayers',kind:'panel',panel:'layers',order:10}],
  rightRail:[{id:'properties',label:'Properties',labelKey:'interface.properties',icon:'DesignInspector',kind:'panel',panel:'properties',order:10}],
  defaultLayout:{leftOpen:true,rightOpen:true,leftWidth:268,rightWidth:320,leftPanels:['layers'],rightPanels:['properties'],activeLeft:'layers',activeRight:'properties'},
  menus:INTERFACE_COMMANDS.map((command,i)=>({menu:command.endsWith('new')||command.endsWith('save')?'Project':command.includes('.add')?'Insert':'Edit',command,group:'interface',order:i*10})),
 },
};
registerStudio(interfaceStudio);registerBlankProjectFactory('interface',startInterface);
