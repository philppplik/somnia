import type {PanelDef} from '../shell/types';
/** Data only: host registration is owned by the UI layer. */
export const sheetsPanelDefs:readonly PanelDef[]=[
 {id:'workbook',title:'Workbook',titleKey:'sheets.panel.workbook',component:'sheets.workbook',icon:'Table2',side:'left',defaultOpen:true,commands:['sheets.navigate','sheets.saveCopy','sheets.undo','sheets.redo']},
 {id:'analysis',title:'Range analysis',titleKey:'sheets.panel.analysis',component:'sheets.analysis',icon:'Search',side:'left',commands:['sheets.analyzeRange','sheets.navigate']},
 {id:'cell',title:'Cell inspector',titleKey:'sheets.panel.cell',component:'sheets.cell',icon:'Table2',side:'right',defaultOpen:true,commands:['sheets.setCell']},
 {id:'formulas',title:'Formula builder',titleKey:'sheets.panel.formulas',component:'sheets.formulas',icon:'Code',side:'right',commands:['sheets.setCell','sheets.navigate']},
];
