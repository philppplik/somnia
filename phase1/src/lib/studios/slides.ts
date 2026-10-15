import {registerStudio,type StudioDef} from './registry';
import type {PanelDef} from '../shell/types';
import {slidesInspector,slidesPanels} from '../slides/panelDefinitions';
import {SLIDES_DEFAULT_LAYOUT,SLIDES_LEFT_RAIL,SLIDES_RIGHT_RAIL} from '../slides/shellRail';
/** Files, Search and Versions reuse the Code hosts, as in Documents. Order in the manifest does not set rail order (rail items do). */
const shared=(id:'files'|'search'|'versions',title:string):PanelDef=>({id,title,component:`code.${id}`,side:'left'});
export const slidesShellPanels:readonly PanelDef[]=[shared('files','Files'),shared('search','Search'),shared('versions','Versions'),...slidesPanels];
export const slidesStudio:StudioDef={
 id:'slides',label:'Slides',icon:'Presentation',order:3,formats:[{ext:'pptx',priority:100}],
 shell:{leftRail:[{id:'files',label:'Slides',icon:'Files'}],rightRail:[{id:'design',label:'Slide text',icon:'SlidersHorizontal'}],header:{menus:['View','Help'],views:[],heroAction:{id:'slides.present',labelKey:'cmd.slides.present',icon:'Presentation',menu:['slides.present.fromStart','slides.saveCopy','deploy.open']}},sidebar:'slides.sidebar',bottomBar:{slots:[],viewportPresets:[]},inspector:'slides.inspector',tools:[]},
 commands:[],shortcuts:{},menus:{view:[]},canvas:'slides.canvas',agentV2:{tools:['slides_inspect_text','slides_propose_text','slides_inspect_slide_text','slides_propose_slide_text'],contextProviders:['activeDocument'],quickActions:[]},agent:{tools:['slides_inspect_text','slides_propose_text','slides_inspect_slide_text','slides_propose_slide_text'],contextProviders:[],quickActions:[]},shellV2:{panels:slidesShellPanels,inspector:slidesInspector,leftRail:SLIDES_LEFT_RAIL,rightRail:SLIDES_RIGHT_RAIL,defaultLayout:SLIDES_DEFAULT_LAYOUT},
 deriveContext:context=>context
};
registerStudio(slidesStudio);
