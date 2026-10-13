// Development-only fixture. Never imported by the application or shipped in its bundle.
// Runs the real Code studio shell (rail, panel stack, inspector) against an in-memory fake of the deploy engine.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {EditorProject} from '@somnia/editor-core';
if(!import.meta.env.DEV)throw Error('Development fixture only.');
(globalThis as {isTauri?:boolean}).isTauri=true;
const q=new URLSearchParams(location.search);
document.documentElement.dataset.theme=q.get('theme')==='dark'?'dark':'light';
const {connectEditorProject,patchState,useAppStore}=await import('../src/store/appStore');
const {initLocale}=await import('../src/lib/i18n');
await import('../src/styles/global.css');await import('../src/styles/bento.css');await import('../src/styles/publish.css');
const {__setPublishBackendForTests,getPublishStore}=await import('../src/lib/deploy/publishController');
const {createFakeDeployBackend,FAKE_FINGERPRINT}=await import('../src/lib/deployPanels/fakeBackend');
const {registerDeployCommands}=await import('../src/lib/deploy/register');
const {registerDeployConfirmPresenter}=await import('../src/lib/deploy/confirmation');
const {dialogPresenter}=await import('../src/lib/deploy/confirmStore');
await import('../src/components/studios/code/registerShell');
const {deployPanelActions}=await import('../src/components/deploy/deployShellActions');
const {ShellFrame}=await import('../src/components/shell/ShellFrame');
const {IconRail}=await import('../src/components/IconRail');
const {SidebarPanelStack}=await import('../src/components/shell/SidebarPanelStack');
const {DeployConfirmHost}=await import('../src/components/DeployConfirmHost');
const {PublishDialog}=await import('../src/components/PublishDialog');
const {useCodeStudioContext}=await import('../src/components/studios/code/useCodeStudioContext');
const {mountCodePanelCommands}=await import('../src/store/codePanelCommands');
const mode=q.get('state')??'ready';
const target=(id:string,name:string,kind:'static'|'node',domain?:string)=>({id,name,host:'203.0.113.10',port:22,user:'somnia',domain,kind,keySlot:`deploy-key:${id}`});
const targets=[
 {target:target('main','Main site','static','example.com'),state:'ready' as const,fingerprint:FAKE_FINGERPRINT},
 {target:target('api','Shop app','node','shop.example.com'),state:'needs-trust' as const},
 {target:target('new','Staging','static'),state:'key-missing' as const},
];
const files=[
 {path:'index.html',size:4210,sha256:'a'.repeat(64),change:'changed' as const},
 {path:'css/site.css',size:18230,sha256:'b'.repeat(64),change:'changed' as const},
 {path:'img/hero.webp',size:182400,sha256:'c'.repeat(64),change:'added' as const},
 {path:'old/legacy.js',size:900,sha256:'d'.repeat(64),change:'removed' as const},
 {path:'about.html',size:2100,sha256:'e'.repeat(64),change:'unchanged' as const},
];
const fake=createFakeDeployBackend({targets:mode==='empty'?[]:targets,files,live:'20261012T100000Z-bbbbbb',releases:['20261010T100000Z-aaaaaa','20261012T100000Z-bbbbbb']});
(window as unknown as {__fake:unknown}).__fake=fake;
__setPublishBackendForTests(fake.backend);registerDeployCommands(fake.backend);registerDeployConfirmPresenter(dialogPresenter);
const pkgOf=(m:string)=>m==='node'?JSON.stringify({dependencies:{next:'15.0.0',react:'19.0.0'}}):m==='react'?JSON.stringify({dependencies:{react:'19.0.0'},devDependencies:{vite:'6.0.0'}}):'';
const load=(m:string)=>{const pkg=pkgOf(m);connectEditorProject(new EditorProject({'index.html':'<!doctype html>\n<html><body><main id="hero"><h1>Somnia</h1></main></body></html>',...(pkg?{'package.json':pkg}:{})}));patchState({activeFile:'index.html',designFile:'index.html'});};
// Dry run and publish build framework projects through the native runner, which a browser cannot do: load the framework after the plan.
(window as unknown as {__load:unknown}).__load=load;load(mode==='node'?'node':'plain');
patchState({activeStudio:'code',activeFile:'index.html',designFile:'index.html',viewMode:'split',sidebarOpen:true,inspectorOpen:true});
mountCodePanelCommands();initLocale();
const store=getPublishStore();await store.refresh();if(mode!=='empty')store.select('main');
{const {shellLayoutStore}=await import('../src/store/shellLayoutStore');const {studioPanels,studioDefaultLayout}=await import('../src/lib/shell/codePanels');const {codeStudio}=await import('../src/lib/studios/code');shellLayoutStore.update('code',{leftPanels:['publish','publish-log'],activeLeft:'publish'},studioDefaultLayout(codeStudio),studioPanels(codeStudio));}
function Fixture(){useCodeStudioContext();const s=useAppStore();
 return <div className="app-frame flex flex-col gap-shell bg-shell p-shell" style={{height:900,width:1280}}>
  <ShellFrame leftRail={<IconRail side="left"/>} rightRail={<IconRail side="right"/>} leftOpen={s.sidebarOpen} rightOpen={s.inspectorOpen} leftWidth={300} rightWidth={340} canvas={<div className="h-full rounded-lg bg-panel"/>} left={<SidebarPanelStack side="left" legacy={null}/>} right={<SidebarPanelStack side="right" legacy={null}/>}/>
  <PublishDialog/><DeployConfirmHost/>
 </div>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
(window as unknown as {__ready:boolean}).__ready=true;
