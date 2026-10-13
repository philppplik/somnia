import type {PanelDef,InspectorDef} from '../shell/types';
/** Pure data shared by the shell manifest and the explicit UI host registration. */
export const slidesPanels:readonly PanelDef[]=[
 {id:'overview',title:'Slides',titleKey:'slides.panel.overview',component:'slides.overview',side:'left',icon:'Presentation',defaultOpen:true,minHeight:160,commands:['slides.showSlide','slides.loadThumbnails']},
 {id:'outline',title:'Text outline',titleKey:'slides.panel.outline',component:'slides.outline',side:'left',icon:'List',commands:['slides.showSlide','slides.selectText']},
 {id:'inspector',title:'Slide properties',titleKey:'slides.panel.text',component:'shell.inspector',side:'right',icon:'SlidersHorizontal',defaultOpen:true,minHeight:180},
].map(p=>({...p,persistKey:`slides.${p.id}`} as PanelDef));

export const slidesInspector:InspectorDef={titleKey:'slides.panel.text',emptyKey:'slides.empty',sections:[
 {id:'text',title:'Slide text',titleKey:'slides.panel.text',component:'slides.inspector.text',order:10,when:'document',commands:['slides.editText','slides.selectText','slides.undo','slides.redo','slides.saveCopy']},
 {id:'deck',title:'Presentation',titleKey:'slides.panel.deck',component:'slides.inspector.deck',order:20,when:'document',commands:['slides.saveCopy'],defaultCollapsed:true},
 {id:'diagnostics',title:'Compatibility',titleKey:'slides.panel.diagnostics',component:'slides.inspector.diagnostics',order:30,when:'document',defaultCollapsed:true},
]};
