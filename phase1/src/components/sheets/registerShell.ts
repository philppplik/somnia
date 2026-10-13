import {sheetsStudio} from '../../lib/studios/sheets';
import {registerStudioPanels} from '../studios/registerStudioPanels';
import {SheetsWorkbookPanel,SheetsAnalysisPanel,SheetsFormulasPanel,SheetsCellSection,SheetsFormulasSection} from './SheetsPanels';
/** The manifest owns all names; the UI layer supplies their executable hosts. */
export const disposeSheetsShell=registerStudioPanels(sheetsStudio,{panels:{
 'sheets.workbook':SheetsWorkbookPanel,
 'sheets.analysis':SheetsAnalysisPanel,
 'sheets.formulas':SheetsFormulasPanel,
},sections:{
 'sheets.inspector.cell':SheetsCellSection,
 'sheets.inspector.formulas':SheetsFormulasSection,
}});

if(import.meta.hot)import.meta.hot.dispose(()=>disposeSheetsShell());
