import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SheetsWorkbookPanel,SheetsCellPanel,SheetsAnalysisPanel,SheetsFormulasPanel,SheetsFormatPanel,SheetsLayoutPanel} from './SheetsPanels';
import {setSheetsSelection,type SheetsSelection} from '../../lib/sheets/sheetsStore';
import type {StudioContext} from '../../lib/shell/types';
const context:StudioContext={studio:'sheets',document:{id:'test.xlsx',kind:'xlsx',dirty:false,readOnly:false},selection:{kind:'one',count:1},busy:false,services:{}};
const selection:SheetsSelection={file:'test.xlsx',sheet:0,sheetName:'Sales',address:'A2',kind:'Number',text:'7',formula:null,dirty:false,canUndo:true,canRedo:false,range:{r0:1,c0:0,r1:1,c1:0},workbook:{sheets:[{index:0,name:'Sales',visibility:'Visible'},{index:1,name:'Secret',visibility:'Hidden'}],warnings:['Preserved chart']}};
const html=(Panel:typeof SheetsCellPanel,ctx=context)=>renderToStaticMarkup(<Panel panelId="test" context={ctx}/>);
test('panels fail closed for empty or another studio/document context',()=>{
 setSheetsSelection(selection);
 for(const Panel of [SheetsWorkbookPanel,SheetsCellPanel,SheetsAnalysisPanel,SheetsFormulasPanel,SheetsFormatPanel]){
  assert.match(html(Panel,{...context,studio:'code'}),/Open a workbook/);
  assert.match(html(Panel,{...context,document:{...context.document!,id:'other.xlsx'}}),/Open a workbook/);
 }
 setSheetsSelection(null);assert.match(html(SheetsCellPanel),/Open a workbook/);
});
test('workbook lists hidden sheets disabled, metadata and export/history controls',()=>{
 setSheetsSelection(selection);const markup=html(SheetsWorkbookPanel);assert.match(markup,/Secret/);assert.match(markup,/disabled=""[^>]*aria-pressed="false">Secret/);assert.match(markup,/Preserved chart/);assert.match(markup,/Export copy/);
});
test('formula builder requires an explicit target and exposes real aggregate functions',()=>{
 setSheetsSelection(selection);const markup=html(SheetsFormulasPanel);
 assert.match(markup,/Choose a target cell outside the source range/,'no guessed target: guidance until the user picks a cell');
 assert.match(markup,/disabled="" data-testid="sheets-formula-apply">Apply formula/);
 assert.match(markup,/COUNTA/);
 assert.match(markup,/data-testid="sheets-formula-target"/);
});
test('cell edits are disabled in read-only document context',()=>{
 setSheetsSelection(selection);assert.match(html(SheetsCellPanel,{...context,document:{...context.document!,readOnly:true}}),/disabled="">Apply to selected cell/);
});

test('format panel reflects the active cell style and offers only real font and fill controls',()=>{
 const style={bold:true,italic:false,strike:false,underline:true,color:'#C00000',fill:null,h:'general' as const,wrap:false,fmt:'General',font:'Courier New',size:14,borders:{l:null,r:null,t:null,b:null}};
 setSheetsSelection({...selection,style});const markup=html(SheetsFormatPanel);
 assert.match(markup,/aria-label="Bold"[^>]*aria-pressed="true"/);assert.match(markup,/aria-label="Italic"[^>]*aria-pressed="false"/);assert.match(markup,/aria-label="Underline"[^>]*aria-pressed="true"/);
 assert.match(markup,/<option value="Courier New" selected=""/);assert.match(markup,/value="14"/);assert.match(markup,/value="#C00000"/);assert.doesNotMatch(markup,/aria-label="Fill color"[^>]*value="#C00000"/);assert.match(markup,/No fill/);
 setSheetsSelection({...selection,style:{...style,font:'Papyrus'}});assert.match(html(SheetsFormatPanel),/<option value="Papyrus"/,'a font from the file stays selectable');
 setSheetsSelection(null);
});

test('number format section shows the detected preset, decimals and currency symbol, and keeps file formats as custom',()=>{
 const style={bold:false,italic:false,strike:false,underline:false,color:null,fill:null,h:'general' as const,wrap:false,fmt:'"€"#,##0.0',font:'Calibri',size:11,borders:{l:null,r:null,t:null,b:null}};
 setSheetsSelection({...selection,style});let markup=html(SheetsFormatPanel);
 assert.match(markup,/<option value="currency" selected="">Currency/);assert.match(markup,/<option value="€" selected="">/);assert.match(markup,/Decimal places/);assert.match(markup,/value="1"/);assert.match(markup,/aria-label="Increase decimals"/);
 setSheetsSelection({...selection,style:{...style,fmt:'[$-F800]dddd, mmmm dd, yyyy'}});markup=html(SheetsFormatPanel);
 assert.match(markup,/<option value="custom" disabled="" selected="">Custom \(from file\)/);assert.doesNotMatch(markup,/Decimal places/);
 setSheetsSelection(null);
});
test('alignment, wrap, indent and border controls reflect the active cell',()=>{
 const style={bold:false,italic:false,strike:false,underline:false,color:null,fill:null,h:'center' as const,v:'top' as const,wrap:true,indent:2,fmt:'General',font:'Calibri',size:11,borders:{l:null,r:null,t:null,b:null}};
 setSheetsSelection({...selection,style});const markup=html(SheetsFormatPanel);
 assert.match(markup,/aria-pressed="true"[^>]*data-testid="sheets-format-h-center"/);assert.match(markup,/aria-pressed="false"[^>]*data-testid="sheets-format-h-left"/);
 assert.match(markup,/aria-pressed="true"[^>]*data-testid="sheets-format-v-top"/);assert.match(markup,/aria-pressed="true"[^>]*data-testid="sheets-format-wrap"/);
 assert.match(markup,/data-testid="sheets-format-border-all"/);assert.match(markup,/data-testid="sheets-format-border-topDoubleBottom"/);assert.match(markup,/Line style/);
 assert.doesNotMatch(markup,/disabled=""[^>]*data-testid="sheets-format-indent-less"/,'indent can shrink while indented');
 setSheetsSelection({...selection,style:{...style,indent:0}});assert.match(html(SheetsFormatPanel),/disabled=""[^>]*data-testid="sheets-format-indent-less"/);
 setSheetsSelection(null);
});
test('rows and columns panel shows current sizes and freeze state from the layout',()=>{
 const layout={sheet:0,defaultColWidth:85,defaultRowHeight:20,cols:[{i:0,w:140,hidden:false}],rows:[],showGridlines:true,freeze:{rows:1,cols:0},merges:[]};
 setSheetsSelection({...selection,layout});const markup=html(SheetsLayoutPanel);
 assert.match(markup,/value="140"/);assert.match(markup,/value="20"/);assert.match(markup,/Frozen: 1 rows, 0 columns/);assert.match(markup,/data-testid="sheets-layout-freeze-top"/);
 assert.doesNotMatch(markup,/disabled=""[^>]*data-testid="sheets-layout-unfreeze"/);
 setSheetsSelection({...selection,layout:{...layout,freeze:null}});assert.match(html(SheetsLayoutPanel),/Nothing frozen/);assert.match(html(SheetsLayoutPanel),/disabled=""[^>]*data-testid="sheets-layout-unfreeze"/);
 setSheetsSelection({...selection,layout:null});assert.match(html(SheetsLayoutPanel),/disabled=""[^>]*data-testid="sheets-layout-autofit-cols"/,'no layout yet: controls disabled');
 setSheetsSelection(null);
});
