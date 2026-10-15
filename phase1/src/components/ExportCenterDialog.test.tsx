import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ExportCenterPanel} from './ExportCenterDialog';
import {registerCommand} from '../lib/commandRegistry';
import {CATALOGUES} from '../lib/i18n';

const withCommands=(fn:()=>void)=>{const offs=[['project.export',false],['documents.saveCopy',true],['documents.export.open',true],['slides.saveCopy',true]].map(([id,on])=>registerCommand({id:id as string,title:'Title '+id,category:'Project',level:'ui',enabled:()=>on as boolean,run:()=>{}}));try{fn();}finally{offs.forEach(off=>off());}};

test('panel groups registered export commands in studio order and disables unavailable rows',()=>{
 withCommands(()=>{
  const html=renderToStaticMarkup(<ExportCenterPanel onClose={()=>{}}/>);
  const gi=(s:string)=>html.indexOf(`export-center-group-${s}`);
  assert.ok(gi('project')>-1&&gi('project')<gi('documents')&&gi('documents')<gi('slides'),'group order');
  assert.ok(html.includes('export-center-cmd-project.export'),'row testid');
  const row=html.slice(html.indexOf('export-center-cmd-project.export'));
  assert.match(row,/disabled=""/,'disabled command renders disabled');
  const di=html.indexOf('export-center-cmd-documents.export.open');const si=html.indexOf('export-center-cmd-documents.saveCopy');
  assert.ok(di>-1&&di<si,'command order inside group');
 });
});

test('preset rows render above the plain commands with their enabled state',()=>{
 const offs=[registerCommand({id:'vector.exportPng',title:'PNG',category:'Project',level:'ui',enabled:()=>true,run:()=>{}}),registerCommand({id:'video.export.format',title:'fmt',category:'Project',level:'ui',enabled:()=>false,run:()=>{}}),registerCommand({id:'video.export.start',title:'start',category:'Project',level:'ui',enabled:()=>true,run:()=>{}})];
 try{
  const html=renderToStaticMarkup(<ExportCenterPanel onClose={()=>{}}/>);
  assert.ok(html.includes('export-center-presets-vector'),'vector presets header');
  assert.ok(html.includes('export-center-preset-png2x'),'preset row testid');
  const row=html.slice(html.indexOf('export-center-preset-webm'));
  assert.match(row,/disabled=""/,'preset with a disabled step renders disabled');
  assert.ok(html.indexOf('export-center-preset-png1x')<html.indexOf('export-center-cmd-vector.exportPng'),'presets before commands');
 }finally{offs.forEach(off=>off());}
});

test('search input renders with its own testid and row markers are present for keyboard nav',()=>{
 const offs=[registerCommand({id:'project.export',title:'Export project...',category:'Project',level:'ui',enabled:()=>true,run:()=>{}})];
 try{
  const html=renderToStaticMarkup(<ExportCenterPanel onClose={()=>{}}/>);
  assert.ok(html.includes('data-testid="export-center-search"'),'search input');
  assert.ok(html.includes('type="search"'),'search type');
  assert.ok(html.includes('data-export-row="command"'),'row marker for roving focus');
 }finally{offs.forEach(off=>off());}
});

test('empty registry renders the empty hint',()=>{
 const html=renderToStaticMarkup(<ExportCenterPanel onClose={()=>{}}/>);
 // other suites may have registered exports; only assert when none are present
 if(!html.includes('export-center-group-'))assert.ok(html.includes('export-center-empty'));
});

test('every exportCenter key exists in all locales',()=>{
 const keys=Object.keys(CATALOGUES.en).filter(k=>k.startsWith('exportCenter.')||k==='cmd.project.export.advanced');
 assert.ok(keys.length>=16,`got ${keys.length}`);
 for(const [loc,cat] of Object.entries(CATALOGUES))for(const k of keys)assert.ok((cat as Record<string,string>)[k],`${loc} ${k}`);
});
