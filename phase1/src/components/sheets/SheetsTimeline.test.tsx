import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SheetsTimelinePanel,SheetsTimelineSection} from './SheetsTimeline';
import {setSheetsSelection,type SheetsSelection} from '../../lib/sheets/sheetsStore';
import {noteFilterApplied,noteFilterHistory,resetSlicerFilter} from '../../lib/sheets/slicerState';
import type {StudioContext} from '../../lib/shell/types';
import type {SheetLayout} from '../../lib/sheets/protocol';

const context:StudioContext={studio:'sheets',document:{id:'test.xlsx',kind:'xlsx',dirty:false,readOnly:false},selection:{kind:'one',count:1},busy:false,services:{}};
const selection:SheetsSelection={file:'test.xlsx',sheet:0,sheetName:'Sales',address:'A2',kind:'Number',text:'7',formula:null,dirty:false,canUndo:true,canRedo:false,range:{r0:0,c0:0,r1:9,c1:1},workbook:{sheets:[{index:0,name:'Sales',visibility:'Visible'}],warnings:[]}};
const html=()=>renderToStaticMarkup(<SheetsTimelinePanel panelId="test" context={context}/>);

test('timeline fails closed for another studio or document',()=>{
 setSheetsSelection(selection);resetSlicerFilter('test.xlsx');
 assert.match(renderToStaticMarkup(<SheetsTimelinePanel panelId="t" context={{...context,studio:'code'}}/>),/Open a workbook/);
 assert.match(renderToStaticMarkup(<SheetsTimelinePanel panelId="t" context={{...context,document:{...context.document!,id:'other.xlsx'}}}/>),/Open a workbook/);
});

test('timeline starts with the honest unknown status and no period list before binding',()=>{
 setSheetsSelection(selection);resetSlicerFilter('test.xlsx');
 const markup=html();
 assert.match(markup,/data-testid="sheets-timeline-status">Filter state unknown/);
 assert.match(markup,/<select[^>]*data-testid="sheets-timeline-column"/);
 assert.doesNotMatch(markup,/sheets-timeline-list/,'no periods before the user binds a column');
 assert.doesNotMatch(markup,/sheets-timeline-granularity/,'no granularity select before data');
 assert.match(markup,/data-testid="sheets-timeline-clear"/);
});

test('timeline readback mirrors the slicer mirror: applied, stale, cleared',()=>{
 setSheetsSelection(selection);resetSlicerFilter('test.xlsx');
 noteFilterApplied('test.xlsx',0,{r0:0,c0:0,r1:9,c1:1},{kind:'values',column:0,values:['45700','45731'],blanks:false});
 let markup=html();
 assert.match(markup,/Active: column A - 2 values/);
 noteFilterHistory('test.xlsx');
 assert.match(html(),/Last known: column A - 2 values \(undo\/redo may have changed it\)/);
 noteFilterApplied('test.xlsx',0,{r0:0,c0:0,r1:9,c1:1},{kind:'clear',column:0});
 assert.match(html(),/No filter \(cleared in this session\)/);
});

test('timeline disables apply and clear on a protected sheet without the autofilter permission',()=>{
 const layout:SheetLayout={sheet:0,defaultColWidth:100,defaultRowHeight:20,cols:[],rows:[],showGridlines:true,protection:{password:true,allow:[]},freeze:null,merges:[]};
 setSheetsSelection({...selection,layout});resetSlicerFilter('test.xlsx');
 const markup=html();
 assert.match(markup,/data-testid="sheets-timeline-protected">This sheet is protected and filtering is not allowed./);
 assert.match(markup,/disabled=""[^>]*data-testid="sheets-timeline-clear"/);
 setSheetsSelection(selection);
});

test('timeline section host renders the panel',()=>{
 setSheetsSelection(selection);resetSlicerFilter('test.xlsx');
 const markup=renderToStaticMarkup(<SheetsTimelineSection sectionId="timeline" context={context}/>);
 assert.match(markup,/data-testid="sheets-timeline-column"/);
 setSheetsSelection(null);
});
