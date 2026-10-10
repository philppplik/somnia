import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appDeps,openIncoming} from './openIntake';
import {startStudioRouting} from './studioRouting';
import {clearMedia,getMedia,findMedia} from '../media';
import {getState,patchState,requestStudio} from '../../store/appStore';
test('app wiring: explicit Open from a manually chosen Video Studio routes DOCX to Documents and leaves no manual lock',async()=>{
 const stop=startStudioRouting();clearMedia();patchState({studioChoice:'automatic',activeStudio:'code',studioByTab:{}});
 requestStudio('video');assert.equal(getState().studioChoice,'manual');
 const f=new File([readFileSync('test/documents/sample.docx')],'a.docx');
 const r=await openIncoming([{name:'a.docx',text:'',blob:f}]);
 assert.equal(r.focused?.studioId,'documents');assert.equal(getState().activeStudio,'documents');assert.equal(getState().studioChoice,'automatic');
 assert.equal(getMedia().active,'a.docx');assert.equal(getState().studioByTab['media:a.docx'],'documents');
 // unknown binary: old session untouched
 const before={studio:getState().activeStudio,active:getMedia().active,items:getMedia().items.length};
 const choose=appDeps.choose;appDeps.choose=async()=>null;
 const bad=await openIncoming([{name:'x.bin',text:'',blob:new File([Uint8Array.from([0,1,0,1,0])],'x.bin')}]);
 appDeps.choose=choose;
 assert.equal(bad.focused,null);assert.deepEqual({studio:getState().activeStudio,active:getMedia().active,items:getMedia().items.length},before);
 // text file from Documents goes to Code, previous document stays available
 const t=await openIncoming([{name:'p.html',text:'<p>x</p>'}]);
 assert.equal(t.focused?.studioId,'code');assert.equal(getState().activeStudio,'code');assert.equal(getState().activeFile,'p.html');assert.ok(findMedia('a.docx'),'DOCX tab still open: return = tab navigation');
 stop();clearMedia();patchState({activeStudio:'code',activeFile:'',files:{},openFiles:[]});
});
test('OS file routing ignores a previous compatible tab override; drop can explicitly choose compatible target',async()=>{
 patchState({studioByTab:{'route.svg':'code'}});
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
 const r=await openIncoming([{name:'route.svg',text:svg}],{source:'os'});assert.equal(r.focused?.studioId,'vector');
 const explicit=await openIncoming([{name:'source.svg',text:svg}],{source:'drop',target:'code'});assert.equal(explicit.focused?.studioId,'code');
});
test('Office package with unknown suffix still prepares as Office, never binary text',async()=>{
 const r=await openIncoming([{name:'renamed',text:'',blob:new Blob([readFileSync('test/documents/sample.docx')])}],{source:'os'});
 assert.equal(r.focused?.studioId,'documents');assert.equal(findMedia('renamed')?.kind,'docx');
});
test('new explicit known-file intake dismisses an older unanswered choice',async()=>{
 const old=openIncoming([{name:'old.unknown',text:'hello'}]);
 const {getOpenChoice}=await import('./openChoice');
 for(let i=0;i<20&&!getOpenChoice();i++)await new Promise(r=>setTimeout(r,1));assert.ok(getOpenChoice());
 await openIncoming([{name:'fresh.html',text:'<p>fresh</p>'}]);await old;assert.equal(getOpenChoice(),null);assert.equal(getState().activeStudio,'code');
});
