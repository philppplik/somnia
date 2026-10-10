import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import '../../src/styles/global.css';
import '../../src/styles/bento.css';
import {ConsentReview,RuntimePermissionDialog} from '../../src/components/extensions/ConsentUI';
import {ExtensionSecuritySettings} from '../../src/components/extensions/ExtensionSecuritySettings';
import {ExtensionConsentHost} from '../../src/components/extensions/ExtensionConsentHost';
import {PermissionBroker} from '../../src/lib/extensions/permissionBroker';
import {configureConsentBroker,requestConsentReview,type ConsentCandidate} from '../../src/lib/extensions/consentUiHost';
import example from '../../src/lib/extensions/contracts/v2/example.json';
import type {ManifestV2} from '../../src/lib/extensions/manifestV2';
const values=new Map<string,string>();let closed=0,commits=0;const broker=new PermissionBroker({getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);}}, {invalidate:()=>{}});configureConsentBroker(broker);
const m=structuredClone(example) as ManifestV2;m.name='SVG Optimizer';m.publisher=m.id.split('.')[0];m.version='1.2.0';m.capabilities.untrustedWorkspaces={supported:'supported'};m.security={tier:'A',fs:{read:'project',write:'ask'},network:[{host:'api.github.com',paths:['/repos/philppplik/*'],reason:'Fetch extension release metadata'}],clipboardRead:{reason:'Paste images into optimized assets'}};
const scenario=new URLSearchParams(location.search).get('scenario')||'install';
if(scenario!=='first')broker.acknowledgeFirstRun();
if(scenario==='paused')await broker.setRestrictedMode(true);
if(scenario==='native'){m.name='Git Toolkit';m.security!.tier='B';await broker.setDeveloperMode(true);}
if(scenario==='update'){await broker.approve(m,'manual');}
let runtimePrompt;if(scenario==='runtime'){m.security!.fs!.read='ask';await broker.approve(m,'manual');const session=broker.openSession(m,{trusted:true,virtual:false});broker.checkFilesystem(session,'read','C:\\Users\\Philipp\\Documents\\Brand assets\\logo.svg','C:\\Project','C:\\Users\\Philipp\\Documents\\Brand assets');runtimePrompt=broker.pendingPrompts(true)[0];}
const previous=scenario==='update'?structuredClone(m):undefined;
if(previous){m.version='1.3.0';m.security!.network!.push({host:'api.example.com',paths:['/optimize/*'],reason:'Send selected SVGs for cloud optimization'});}
const candidate:ConsentCandidate={manifest:m,previous,artifactHash:'a'.repeat(64),manifestHash:'b'.repeat(64),verified:{label:'Verified publisher',sourceId:'fixture-record'},validation:'valid',source:'manual',sourcePath:'C:\\Users\\Philipp\\Downloads\\git-toolkit.somniax'};
const api={broker,candidate,closed:()=>closed,commits:()=>commits,change:()=>{candidate.artifactHash='c'.repeat(64);},block:async()=>{await broker.setBlocked(m.id,'This version was revoked by the verified index.');window.dispatchEvent(new CustomEvent('somnia:extension-consent-blocked',{detail:{extensionId:m.id,message:'This version was revoked by the verified index.'}}));},queue:()=>{for(const name of ['First candidate','Second candidate']){const c=structuredClone(candidate);c.manifest.name=name;requestConsentReview({candidate:c,revalidate:async()=>c,commit:async(_c,approve)=>{await approve();commits++;}});}},snapshot:()=>broker.snapshot()};(window as any).__consent=api;
function Fixture(){const [open,setOpen]=useState(true);const close=()=>{closed++;setOpen(false);};return <div style={{minHeight:'100vh',background:'var(--bg-base)',padding:24}}><header style={{padding:16,borderBottom:'1px solid var(--border-subtle)'}}><strong>somnia</strong>　 Project　 Edit　 View　 Tools　 <span className="ec-pill">Code</span></header><div style={{display:'grid',gridTemplateColumns:'200px 1fr 220px',gap:16,marginTop:16,height:'75vh'}}><aside className="ec-card">Files<br/>client-site<br/>index.html<br/>styles.css</aside><main style={{borderRadius:25,background:'var(--bg-elevated)'}}/><aside className="ec-card">Properties</aside></div>{scenario==='first'?<div className="dialog-backdrop"/>:null}{scenario==='first'?<div className="dialog-popup ext-consent" style={{width:800,padding:32}}><strong>Settings / Extensions</strong><ExtensionSecuritySettings broker={broker}/></div>:scenario==='runtime'&&open?<RuntimePermissionDialog prompt={runtimePrompt!} broker={broker} onResolved={close}/>:scenario==='blocked'||scenario==='queue'?<ExtensionConsentHost/>:open?<ConsentReview broker={broker} request={{candidate,revalidate:async()=>{if(new URLSearchParams(location.search).has('delay'))await new Promise(resolve=>setTimeout(resolve,800));return structuredClone(candidate);},commit:async(_c,approve)=>{await approve();commits++;},onActivity:()=>{}}} onClose={close}/>:<p role="status">Closed</p>}</div>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
