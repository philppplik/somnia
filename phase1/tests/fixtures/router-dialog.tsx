import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/styles/global.css';
import '../../src/styles/bento.css';
import {OpenStudioDialog} from '../../src/components/studios/OpenStudioDialog';
import {askOpenStudio,answerOpenChoice} from '../../src/lib/studios/openChoice';
import {createOpenCoordinator,type OpenInput} from '../../src/lib/studios/openCoordinator';
import {setLocale} from '../../src/lib/i18n';
import {registerOpenHandler} from '../../src/lib/studios/openHandlers';
import '../../src/lib/studios';
const params=new URLSearchParams(location.search);
setLocale(params.get('lang')??'en');
const theme=params.get('theme')??'light';document.documentElement.dataset.theme=theme;document.documentElement.dataset.palette=theme;
if(params.get('mode')==='choose'){
 registerOpenHandler({id:'fixture.sound.text',studioId:'sound',kinds:['text'],priority:200,capability:'edit'});
 registerOpenHandler({id:'fixture.code.text',studioId:'code',kinds:['text'],priority:200,capability:'edit'});
}
let asks=0,commits=0,approvals=0;
const coordinator=createOpenCoordinator({
 openChoice:{askOpenStudio:(input,resolution)=>{document.body.dataset.asks=String(++asks);return askOpenStudio(input,resolution,params.get('mode')==='choose'?'sound':'code');},cancelPending:()=>answerOpenChoice(null)},
 async prepare(input,resolution){return{name:input.name,studioId:resolution.studioId,affectedDocs:()=>[],commit(){document.body.dataset.commits=String(++commits);return{ok:true,key:input.name};},dispose(){},focus(){}};},
 async approve(){document.body.dataset.approvals=String(++approvals);return'approved';},revalidate:()=>true,
 switchStudio(studio){document.body.dataset.answer=studio;},notify(text){document.body.dataset.notice=text;}
});
const enc=(s:string)=>new TextEncoder().encode(s);
const mode=params.get('mode');
const input:OpenInput=mode==='ready'?{name:'known.txt',bytes:enc('hello')}:mode==='choose'?{name:'ambiguous.txt',bytes:enc('hello')}:mode==='unsupported'?{name:'binary.bin',bytes:new Uint8Array([0,1,0])}:mode==='invalid'?{name:'broken.docx',bytes:enc('not an office file')}:{name:'unknown.notes',bytes:enc('hello')};
document.body.dataset.asks='0';document.body.dataset.commits='0';document.body.dataset.approvals='0';
void coordinator.openFiles([input]).then(report=>{document.body.dataset.status=report.outcomes[0]?.status;document.body.dataset.done='true';if(report.outcomes[0]?.status==='cancelled')document.body.dataset.answer='cancelled';});
createRoot(document.getElementById('root')!).render(<div className="app-frame h-dvh bg-shell"><OpenStudioDialog/></div>);
