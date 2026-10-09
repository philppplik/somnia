import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openIncoming} from './openIntake';
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
 const bad=await openIncoming([{name:'x.bin',text:'',blob:new File([Uint8Array.from([0,1,0,1,0])],'x.bin')}]);
 assert.equal(bad.focused,null);assert.deepEqual({studio:getState().activeStudio,active:getMedia().active,items:getMedia().items.length},before);
 // text file from Documents goes to Code, previous document stays available
 const t=await openIncoming([{name:'p.html',text:'<p>x</p>'}]);
 assert.equal(t.focused?.studioId,'code');assert.equal(getState().activeStudio,'code');assert.equal(getState().activeFile,'p.html');assert.ok(findMedia('a.docx'),'DOCX tab still open: return = tab navigation');
 stop();clearMedia();patchState({activeStudio:'code',activeFile:'',files:{},openFiles:[]});
});
