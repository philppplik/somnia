import {registerBlankProjectFactory} from './blank';
import {startDesign} from '../design/session';
import {registerStudio,type StudioDef} from './registry';
/** Layout/design workspace, deliberately separate from SVG/Vector editing. */
export const designStudio:StudioDef={
 id:'design',label:'Design',icon:'LayoutTemplate',order:50,formats:[{ext:'somdesign',priority:100}],
 shell:{leftRail:[{id:'files',label:'Files',icon:'Files',global:true}],rightRail:[{id:'design',label:'Artboard and layers',icon:'SlidersHorizontal'}],header:{menus:['Project','Edit','View','Tools','Help'],views:[]},bottomBar:{slots:[],viewportPresets:[]},inspector:'design.inspector',tools:[]},
 commands:[],shortcuts:{},menus:{view:[]},canvas:'design.canvas',
 agent:{tools:[],contextProviders:[],quickActions:[]},deriveContext:context=>context
};
registerStudio(designStudio);

registerBlankProjectFactory('design',startDesign);
