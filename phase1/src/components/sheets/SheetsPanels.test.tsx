import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SheetsWorkbookPanel,SheetsCellPanel,SheetsAnalysisPanel,SheetsFormulasPanel} from './SheetsPanels';
import {setSheetsSelection,type SheetsSelection} from '../../lib/sheets/sheetsStore';
import type {StudioContext} from '../../lib/shell/types';
const context:StudioContext={studio:'sheets',document:{id:'test.xlsx',kind:'xlsx',dirty:false,readOnly:false},selection:{kind:'one',count:1},busy:false,services:{}};
const selection:SheetsSelection={file:'test.xlsx',sheet:0,sheetName:'Sales',address:'A2',kind:'Number',text:'7',formula:null,dirty:false,canUndo:true,canRedo:false,range:{r0:1,c0:0,r1:1,c1:0},workbook:{sheets:[{index:0,name:'Sales',visibility:'Visible'},{index:1,name:'Secret',visibility:'Hidden'}],warnings:['Preserved chart']}};
const html=(Panel:typeof SheetsCellPanel,ctx=context)=>renderToStaticMarkup(<Panel panelId="test" context={ctx}/>);
test('panels fail closed for empty or another studio/document context',()=>{
 setSheetsSelection(selection);
 for(const Panel of [SheetsWorkbookPanel,SheetsCellPanel,SheetsAnalysisPanel,SheetsFormulasPanel]){
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
