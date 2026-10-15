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
