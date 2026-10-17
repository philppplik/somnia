import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SheetsSlicerPanel,SheetsSlicerSection} from './SheetsSlicer';
import {setSheetsSelection,type SheetsSelection} from '../../lib/sheets/sheetsStore';
import {noteFilterApplied,noteFilterHistory,resetSlicerFilter} from '../../lib/sheets/slicerState';
import type {StudioContext} from '../../lib/shell/types';

const context:StudioContext={studio:'sheets',document:{id:'test.xlsx',kind:'xlsx',dirty:false,readOnly:false},selection:{kind:'one',count:1},busy:false,services:{}};
const selection:SheetsSelection={file:'test.xlsx',sheet:0,sheetName:'Sales',address:'A2',kind:'Number',text:'7',formula:null,dirty:false,canUndo:true,canRedo:false,range:{r0:0,c0:0,r1:9,c1:1},workbook:{sheets:[{index:0,name:'Sales',visibility:'Visible'}],warnings:[]}};
const html=()=>renderToStaticMarkup(<SheetsSlicerPanel panelId="test" context={context}/>);

test('slicer fails closed for another studio or document',()=>{
 setSheetsSelection(selection);resetSlicerFilter('test.xlsx');
 assert.match(renderToStaticMarkup(<SheetsSlicerPanel panelId="t" context={{...context,studio:'code'}}/>),/Open a workbook/);
 assert.match(renderToStaticMarkup(<SheetsSlicerPanel panelId="t" context={{...context,document:{...context.document!,id:'other.xlsx'}}}/>),/Open a workbook/);
});

test('slicer binds a column of the selection and starts with an honest unknown status',()=>{
 setSheetsSelection(selection);resetSlicerFilter('test.xlsx');
 const markup=html();
 assert.match(markup,/data-testid="sheets-slicer-status">Filter state unknown/, 'unknown, never a claimed "no filter"');
 assert.match(markup,/<select[^>]*data-testid="sheets-slicer-column"[^>]*>.*<option value="0" selected="">A<\/option>.*<option value="1">B<\/option>/s,'selection columns offered');
 assert.match(markup,/data-testid="sheets-slicer-load"[^>]*>Load values/);
 assert.doesNotMatch(markup,/sheets-slicer-list/,'no value list before the user binds');
 assert.match(markup,/data-testid="sheets-slicer-clear"/);
});

test('slicer readback shows the applied filter and demotes to last-known after history',()=>{
 setSheetsSelection(selection);resetSlicerFilter('test.xlsx');
 noteFilterApplied('test.xlsx',0,{r0:0,c0:0,r1:9,c1:1},{kind:'values',column:1,values:['x','y','z'],blanks:true});
 let markup=html();
 assert.match(markup,/Active: column B - 3 values \+ \(Blanks\)/);
 noteFilterHistory('test.xlsx');
 markup=html();
 assert.match(markup,/Last known: column B - 3 values \+ \(Blanks\) \(undo\/redo may have changed it\)/);
 resetSlicerFilter('test.xlsx');
 assert.match(html(),/Filter state unknown/,'a fresh engine open forgets the old state');
});

test('slicer readback shows a cleared filter honestly',()=>{
 setSheetsSelection(selection);resetSlicerFilter('test.xlsx');
 noteFilterApplied('test.xlsx',0,{r0:0,c0:0,r1:9,c1:1},{kind:'values',column:0,values:['x'],blanks:false});
 noteFilterApplied('test.xlsx',0,{r0:0,c0:0,r1:9,c1:1},{kind:'clear',column:0});
 assert.match(html(),/No filter \(cleared in this session\)/);
});

test('slicer section host renders the panel',()=>{
 setSheetsSelection(selection);resetSlicerFilter('test.xlsx');
 const markup=renderToStaticMarkup(<SheetsSlicerSection sectionId="slicer" context={context}/>);
 assert.match(markup,/data-testid="sheets-slicer-column"/);
 setSheetsSelection(null);
});
