import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/styles/global.css';
import '../../src/styles/bento.css';
import {OpenStudioDialog} from '../../src/components/studios/OpenStudioDialog';
import {askOpenStudio,answerOpenChoice} from '../../src/lib/studios/openChoice';
import {createOpenCoordinator,type OpenInput} from '../../src/lib/studios/openCoordinator';
import {setLocale} from '../../src/lib/i18n';
import {registerOpenHandler} from '../../src/lib/studios/openHandlers';
import {registerExtensionOpenOffer,setExtensionOpenOfferDispatch,extensionOffersFor,hasExtensionOpenOfferDispatch,dispatchExtensionOpenOffer,stashOfferFile,dropOfferFile,type RoutedOpenOffer} from '../../src/lib/extensions/openRouter';
import pkgManifest from '../../examples/md-viewer/somnia-extension.json?raw';
import pkgCode from '../../examples/md-viewer/main.js?raw';
import '../../src/lib/studios';
const params=new URLSearchParams(location.search);
setLocale(params.get('lang')??'en');
const theme=params.get('theme')??'light';document.documentElement.dataset.theme=theme;document.documentElement.dataset.palette=theme;
if(params.get('mode')==='choose'){
 registerOpenHandler({id:'fixture.sound.text',studioId:'sound',kinds:['text'],priority:200,capability:'edit'});
 registerOpenHandler({id:'fixture.code.text',studioId:'code',kinds:['text'],priority:200,capability:'edit'});
}
let asks=0,commits=0,approvals=0;
// Real router path, mirroring openIntake wiring: offers come from registerExtensionOpenOffer, are only
// shown with a bound dispatch, and the pick goes through dispatchExtensionOpenOffer. offers=1 registers
// without a dispatch (offer must stay hidden); dispatch=1 binds one (offer becomes pickable and runs).
const testOffer={id:'acme.md-viewer',extensionId:'acme.viewer',kinds:['text' as const],commandId:'acme.viewer.open',capability:'preview' as const,priority:10,title:'MD Viewer (fixture)'};
if(params.get('offers')==='1')registerExtensionOpenOffer(testOffer,()=>true);
if(params.get('dispatch')==='1')setExtensionOpenOfferDispatch(testOffer.id,async args=>{document.body.dataset.offerRun=testOffer.id+':'+(args as {name:string}).name;});
// package=1: install the real example package through manifest validation and the production host
// (real sandboxed worker). The pick then runs extension code, not a fixture stub.
const installPackage=async()=>{
 const [{validateManifest},{activateExtensions},{getState}]=await Promise.all([
  import('../../src/lib/extensions/manifest'),import('../../src/lib/extensions/host'),import('../../src/store/appStore')]);
 const mres=validateManifest({...JSON.parse(pkgManifest),code:pkgCode});
 if(!mres.ok){document.body.dataset.packageError=mres.errors.join('; ');return;}
 activateExtensions([mres.manifest]);document.body.dataset.packageInstalled=mres.manifest.id;
 // Keep the latest appStore notice visible: the extension's ui.notify lands here, earlier unrelated notices are overwritten.
 setInterval(()=>{const n=(getState() as {notice?:unknown}).notice;if(n)document.body.dataset.extNotice=String(n);},100);
};
const useOffers=params.get('offers')==='1'||params.get('package')==='1';
const coordinator=createOpenCoordinator({
 openChoice:{askOpenStudio:(input,resolution,_suggested,offers)=>{document.body.dataset.asks=String(++asks);return askOpenStudio(input,resolution,params.get('mode')==='choose'?'sound':'code',offers);},cancelPending:()=>answerOpenChoice(null)},
 // Identical to openIntake: only offers with a bound dispatch are shown; the picked file is stashed
 // under a single-open token bound to the offering extension and dropped when the command ends.
 ...(useOffers?{extensionOffers:(kind:'text')=>extensionOffersFor(kind).filter((o:RoutedOpenOffer)=>hasExtensionOpenOfferDispatch(o.id)),
  runExtensionOffer:async(offer:RoutedOpenOffer,input:{name:string;bytes:Uint8Array})=>{
   const token=stashOfferFile({name:input.name,bytes:input.bytes},offer.extensionId);
   try{const ok=await dispatchExtensionOpenOffer(offer.id,{name:input.name,token});if(!ok)throw new Error(`no dispatch: ${offer.id}`);}
   finally{dropOfferFile(token);}
  }}:{}),
 async prepare(input,resolution){return{name:input.name,studioId:resolution.studioId,affectedDocs:()=>[],commit(){document.body.dataset.commits=String(++commits);return{ok:true,key:input.name};},dispose(){},focus(){}};},
 async approve(){document.body.dataset.approvals=String(++approvals);return'approved';},revalidate:()=>true,
 switchStudio(studio){document.body.dataset.answer=studio;},notify(text){document.body.dataset.notice=text;}
});
const enc=(s:string)=>new TextEncoder().encode(s);
const mode=params.get('mode');
const input:OpenInput=mode==='ready'?{name:'known.txt',bytes:enc('hello')}:mode==='choose'?{name:'ambiguous.txt',bytes:enc('hello')}:mode==='unsupported'?{name:'binary.bin',bytes:new Uint8Array([0,1,0])}:mode==='invalid'?{name:'broken.docx',bytes:enc('not an office file')}:{name:'unknown.notes',bytes:enc('hello')};
document.body.dataset.asks='0';document.body.dataset.commits='0';document.body.dataset.approvals='0';
const start=()=>coordinator.openFiles([input]).then(report=>{document.body.dataset.status=report.outcomes[0]?.status;document.body.dataset.done='true';if(report.outcomes[0]?.status==='cancelled')document.body.dataset.answer='cancelled';});
if(params.get('package')==='1')void installPackage().then(start);else void start();
createRoot(document.getElementById('root')!).render(<div className="app-frame h-dvh bg-shell"><OpenStudioDialog/></div>);
