import {registerStudio,type StudioDef} from './registry';
/** Vector Studio: path and shape engine on the vectorio document model, node editing, strict SVG import and clean SVG/PNG export. */
export const vectorStudio:StudioDef={
 id:'vector',label:'studio.vector',icon:'Pencil',order:7,
 formats:[{ext:'svg',priority:5}],
 shell:{
  leftRail:[{id:'files',label:'Files',icon:'Files',global:true}],
  rightRail:[],
  header:{menus:['Project','Edit','View','Tools','Help'],views:[]},
  bottomBar:{slots:['zoom'],viewportPresets:[]},
  inspector:'vector.inspector',tools:[]
 },
 commands:[],shortcuts:{'studio.vector':'Mod+8'},menus:{view:[]},canvas:'vector.canvas',
 agent:{tools:[],contextProviders:['activeDocument'],quickActions:[]},deriveContext:context=>context
};
registerStudio(vectorStudio);
import {registerBlankProjectFactory} from './blank';
import {createBlankVector} from '../vectorstudio/session';
import {requestStudio} from '../../store/appStore';
/** "Create blank project" anywhere in the app opens an empty 1024 x 1024 page in the Vector Studio. */
registerBlankProjectFactory('vector',()=>{createBlankVector(1024,1024);requestStudio('vector','manual');});
