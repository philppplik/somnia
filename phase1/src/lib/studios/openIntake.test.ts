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
import {appDeps,installApprovalFailureSink,installConfirmAction,registerOpenDocument,forgetOpenDocument} from './openIntake';
import {createBlankVector,commit as vectorCommit,getVectorSession,resetVectorSession} from '../vectorstudio/session';
const SVG='<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="5" height="5"/></svg>';
function dirtyVector(){resetVectorSession();createBlankVector(100,100,'Old.svg');const d=getVectorSession().doc;vectorCommit({...d,width:101});assert.equal(getVectorSession().dirty,true);}
test('approve: no dirty document affected approves without any dialog',async()=>{
 let asked=0;installConfirmAction(async()=>{asked++;return true;});resetVectorSession();
 const prepared=await appDeps.prepare({name:'a.html',bytes:new TextEncoder().encode('<p/>')},{status:'ready',kind:'text',handler:{studioId:'code'} as never,studioId:'code',preview:false} as never);
 const plan={generation:1,items:[],affected:prepared.affectedDocs(),revisionTokens:[]};
 assert.equal(await appDeps.approve(plan),'approved');assert.equal(asked,0);prepared.dispose();installConfirmAction(null);
});
test('approve: dirty Vector document asks once; decline cancels; missing confirmAction fails closed',async()=>{
 dirtyVector();
 const res={status:'ready',kind:'svg',handler:{studioId:'vector'} as never,studioId:'vector',preview:false} as never;
 const prepared=await appDeps.prepare({name:'n.svg',bytes:new TextEncoder().encode(SVG)},res);
 const affected=prepared.affectedDocs();assert.equal(affected.some(a=>a.dirty),true);
 const plan={generation:1,items:[],affected,revisionTokens:[]};
 const asked:string[]=[];installConfirmAction(async r=>{asked.push(r.message);return false;});
 assert.equal(await appDeps.approve(plan),'cancelled');assert.equal(asked.length,1);assert.match(asked[0],/Old\.svg/);
 installConfirmAction(async()=>true);assert.equal(await appDeps.approve(plan),'approved');
 installConfirmAction(null);await assert.rejects(appDeps.approve(plan));
 prepared.dispose();resetVectorSession();
});
test('revalidate: editing the Vector document after planning invalidates the plan',async()=>{
 resetVectorSession();createBlankVector(100,100,'Old.svg');
 const prepared=await appDeps.prepare({name:'n.svg',bytes:new TextEncoder().encode(SVG)},{status:'ready',kind:'svg',handler:{studioId:'vector'} as never,studioId:'vector',preview:false} as never);
 const affected=prepared.affectedDocs();const plan={generation:1,items:[],affected,revisionTokens:affected.map(a=>a.token)};
 assert.equal(appDeps.revalidate(plan),true);
 vectorCommit({...getVectorSession().doc,width:222});
 assert.equal(appDeps.revalidate(plan),false);prepared.dispose();resetVectorSession();
});
test('intake through the app: failing approval is cancelled, logged once with the request id, nothing opened',async()=>{
 dirtyVector();installConfirmAction(null);const seen:unknown[]=[];installApprovalFailureSink((id)=>seen.push(id));
 const r=await openIncoming([{name:'n.svg',text:SVG,requestId:'REQ9',ordinal:0}]);
 assert.equal(r.cancelled,true);assert.deepEqual(seen,['REQ9']);assert.equal(getVectorSession().name,'Old.svg');
 installApprovalFailureSink(()=>{});resetVectorSession();
});
test('intake through the app: dirty replace confirmed opens; same identity opened again is activated, not duplicated',async()=>{
 const stop=startStudioRouting();patchState({files:{},activeFile:'',openFiles:[]});
 installConfirmAction(async()=>true);
 const first=await openIncoming([{name:'dup.html',text:'<p>1</p>',requestId:'R1',ordinal:0,identityToken:'ID-1'},{name:'dup.html',text:'<p>2</p>',requestId:'R1',ordinal:1,identityToken:'ID-2'}]);
 assert.deepEqual(first.outcomes.map(o=>[o.ordinal,o.status]),[[0,'opened'],[1,'opened']]);
 const again=await openIncoming([{name:'dup.html',text:'<p>1</p>',requestId:'R2',ordinal:0,identityToken:'ID-1'}]);
 assert.equal(again.outcomes[0].status,'activated-existing');
 forgetOpenDocument('ID-1');forgetOpenDocument('ID-2');registerOpenDocument('GONE',{studioId:'code',key:'not-there.html'});
 const gone=await openIncoming([{name:'x.html',text:'<p/>',identityToken:'GONE'}]);assert.equal(gone.outcomes[0].status,'opened','stale identity entry ignored once the document is closed');
 installConfirmAction(null);stop();patchState({activeStudio:'code',activeFile:'',files:{},openFiles:[]});
});
