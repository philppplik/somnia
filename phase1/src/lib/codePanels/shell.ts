import type {PanelDef,InspectorDef} from '../shell/types';
import {deployPanels,deployInspectorSections} from '../deployPanels/shell';
/** Pure manifest data; rail placement is owned by the Code rail module. */
export const codePanels:readonly PanelDef[]=[
 ...['layers','files','search','components','css','versions'].map(id=>({id,title:id==='css'?'CSS':id[0].toUpperCase()+id.slice(1),component:`code.${id}`,side:'left' as const,persistKey:`code.${id}`,defaultOpen:id==='layers',minHeight:140})),
 {id:'outline',title:'DOM outline',titleKey:'code.panel.outline',component:'code.outline',side:'left',persistKey:'code.outline',commands:['code.outline.reveal'],minHeight:140},
 {id:'responsive',title:'Responsive',titleKey:'code.panel.responsive',component:'code.responsive',side:'left',persistKey:'code.responsive',commands:['code.preview.width'],minHeight:180},
 {id:'inspector',title:'Inspector',titleKey:'shell.inspector.title',component:'shell.inspector',side:'right',defaultOpen:true,minHeight:180},
 ...deployPanels,
];
export const codeInspector:InspectorDef={titleKey:'shell.inspector.title',emptyKey:'code.panel.open',emptyWhen:'!document',sections:[
 {id:'design',title:'Design',titleKey:'ctx.section.style',component:'code.inspector.design',order:10},
 {id:'interactions',title:'Interactions',titleKey:'code.panel.interactions',component:'code.inspector.interactions',when:"selection.kind == 'one'",order:20,commands:['code.attribute.set']},
 {id:'source',title:'Source details',titleKey:'code.panel.source',component:'code.inspector.source',order:30,commands:['code.outline.reveal'],defaultCollapsed:true},
 ...deployInspectorSections,
]};
export const CODE_PANEL_COMMANDS=['code.outline.reveal','code.attribute.set','code.preview.width'] as const;
export const codePanelShell={panels:codePanels,inspector:codeInspector};
