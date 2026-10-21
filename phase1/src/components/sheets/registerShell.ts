import {lazyPanel} from '../studios/lazyPanel';
import {sheetsStudio} from '../../lib/studios/sheets';
import {registerStudioPanels} from '../studios/registerStudioPanels';
const SheetsWorkbookPanel=lazyPanel(()=>import('./SheetsPanels').then(m=>m.SheetsWorkbookPanel));
const SheetsAnalysisPanel=lazyPanel(()=>import('./SheetsPanels').then(m=>m.SheetsAnalysisPanel));
const SheetsFormulasPanel=lazyPanel(()=>import('./SheetsPanels').then(m=>m.SheetsFormulasPanel));
const SheetsCellSection=lazyPanel(()=>import('./SheetsPanels').then(m=>m.SheetsCellSection));
const SheetsFormulasSection=lazyPanel(()=>import('./SheetsPanels').then(m=>m.SheetsFormulasSection));
const SheetsFormatSection=lazyPanel(()=>import('./SheetsPanels').then(m=>m.SheetsFormatSection));
const SheetsLayoutSection=lazyPanel(()=>import('./SheetsPanels').then(m=>m.SheetsLayoutSection));
const SheetsSlicerSection=lazyPanel(()=>import('./SheetsSlicer').then(m=>m.SheetsSlicerSection));
const SheetsTimelineSection=lazyPanel(()=>import('./SheetsTimeline').then(m=>m.SheetsTimelineSection));
/** The manifest owns all names; the UI layer supplies their executable hosts. */
export const disposeSheetsShell=registerStudioPanels(sheetsStudio,{panels:{
 'sheets.workbook':SheetsWorkbookPanel,
 'sheets.analysis':SheetsAnalysisPanel,
 'sheets.formulas':SheetsFormulasPanel,
},sections:{
 'sheets.inspector.cell':SheetsCellSection,
 'sheets.inspector.format':SheetsFormatSection,
 'sheets.inspector.layout':SheetsLayoutSection,
 'sheets.inspector.slicer':SheetsSlicerSection,
 'sheets.inspector.timeline':SheetsTimelineSection,
 'sheets.inspector.formulas':SheetsFormulasSection,
}});

if(import.meta.hot)import.meta.hot.dispose(()=>disposeSheetsShell());
