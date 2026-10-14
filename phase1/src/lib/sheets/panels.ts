import type {PanelDef,InspectorDef} from '../shell/types';
/** Data only: host registration is owned by the UI layer. */
export const sheetsPanelDefs:readonly PanelDef[]=[
 {id:'workbook',title:'Workbook',titleKey:'sheets.panel.workbook',component:'sheets.workbook',icon:'Table2',side:'left',defaultOpen:true,commands:['sheets.navigate','sheets.saveCopy','sheets.undo','sheets.redo']},
 {id:'analysis',title:'Range analysis',titleKey:'sheets.panel.analysis',component:'sheets.analysis',icon:'Search',side:'left',commands:['sheets.analyzeRange','sheets.navigate']},
 {id:'inspector',title:'Cell inspector',titleKey:'sheets.panel.cell',component:'shell.inspector',icon:'Table2',side:'right',defaultOpen:true,commands:['sheets.setCell']},
 {id:'formulas',title:'Formula builder',titleKey:'sheets.panel.formulas',component:'sheets.formulas',icon:'Code2',side:'right',commands:['sheets.setCell','sheets.navigate']},
];

export const sheetsInspectorDef:InspectorDef={titleKey:'sheets.panel.cell',emptyKey:'sheets.panel.none',sections:[
 {id:'cell',title:'Cell',titleKey:'sheets.panel.cell',component:'sheets.inspector.cell',when:"services.workbook && selection.kind != 'none'",order:10,commands:['sheets.setCell']},
 {id:'format',title:'Format',titleKey:'sheets.panel.formatting',component:'sheets.inspector.format',when:'services.workbook',order:15,commands:['sheets.format']},
 {id:'layout',title:'Rows and columns',titleKey:'sheets.panel.layout',component:'sheets.inspector.layout',when:'services.workbook',order:17,defaultCollapsed:true,commands:['sheets.resize','sheets.freeze']},
 {id:'formulas',title:'Formula builder',titleKey:'sheets.panel.formulas',component:'sheets.inspector.formulas',when:'services.workbook',order:20,defaultCollapsed:true,commands:['sheets.setCell']},
]};
