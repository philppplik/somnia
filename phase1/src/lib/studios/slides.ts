import {registerStudio,type StudioDef} from './registry';
export const slidesStudio:StudioDef={
 id:'slides',label:'Slides',icon:'Code2',order:4,formats:[{ext:'pptx',priority:100}],
 shell:{leftRail:[{id:'files',label:'Slides',icon:'Files'}],rightRail:[{id:'design',label:'Slide text',icon:'SlidersHorizontal'}],header:{menus:['View','Help'],views:[]},sidebar:'slides.sidebar',bottomBar:{slots:[],viewportPresets:[]},inspector:'slides.inspector',tools:[]},
 commands:[],shortcuts:{},menus:{view:[]},canvas:'slides.canvas',agent:{tools:['deck_inspect','deck_propose_changes'],contextProviders:[],quickActions:[]},deriveContext:context=>context
};
registerStudio(slidesStudio);
