import {invoke} from '@tauri-apps/api/core';
import {SELFTEST_ENV,PROBE_EXTENSION_ID,PROBE_EXTENSION_CODE,PANEL_PROBE_SCRIPT,runExtSelftest,type ProbeReport,type NavReport,type SelftestPorts} from './selftest';
import {ExtensionRuntime,browserWorker} from './runtime';
import {panelDocument} from './panelHtml';
import {PanelSession} from './panelSession';
import {openPanelDocument,closeExtDocuments} from './nativeScheme';
import type {ExtensionManifest} from './types';
/** App wiring for the L3 native self-test (docs/extensions/14-native-selftest.md). Runs only when the Rust side reports SOMNIA_EXT_SELFTEST (cargo feature `ext-selftest`). NOT natively verified yet. */
interface SelftestEnv{out:string;evil:string}
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const token=()=>{const b=new Uint8Array(16);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');};
const fail=(error:string):ProbeReport=>({started:false,api_roundtrip:false,network_blocked:false,dom_blocked:false,attempts:{},violations:[],error});

async function runWorkerProbe(evil:string):Promise<ProbeReport>{
 const manifest={id:PROBE_EXTENSION_ID,name:'Selftest probe',version:'1.0.0',apiVersion:1,code:PROBE_EXTENSION_CODE(evil),permissions:['project.read','commands','ui.notify'],contributes:{commands:[],snippets:[],codeThemes:[],panels:[]}} as unknown as ExtensionManifest;
 let report:ProbeReport|null=null;
 const rt=new ExtensionRuntime(manifest,{files:()=>({}),applyOperations(){},selection:()=>null,storage:{get:()=>null,set(){}},notify:t=>{if(t.startsWith('SELFTEST_REPORT '))try{report=JSON.parse(t.slice(16));}catch{/* ignore */}},log:()=>{}},browserWorker);
 rt.activate();
 for(let i=0;i<100&&!report;i++)await wait(100);
 rt.dispose();closeExtDocuments(PROBE_EXTENSION_ID);
 return report??fail('worker produced no report (did not start or no network-free report channel)');
}

/** Mount a sandboxed probe frame exactly like ExtensionPanel does and bind a PanelSession to it. */
async function mountPanel(panelId:string,bodyHtml:string,onReport:(r:ProbeReport)=>void){
 const tok=token();let loads=0;let navigated=false;
 const session=new PanelSession({token:tok,onNavigated:()=>{navigated=true;},handle:m=>{if(m==='project.listFiles')return [];throw new Error('denied');}});
 const r=await openPanelDocument(PROBE_EXTENSION_ID,panelId,panelDocument(bodyHtml,null));
 const f=document.createElement('iframe');f.setAttribute('sandbox','allow-scripts');f.style.cssText='position:fixed;width:300px;height:300px;left:-1000px';
 const on=(e:MessageEvent)=>{const d=e.data as {type?:string}|null;if(e.source===f.contentWindow&&d&&d.type==='probe.report')onReport(d as unknown as ProbeReport);else session.onWindowMessage(e.source,f.contentWindow,e.data);};
 window.addEventListener('message',on);f.onload=()=>{loads++;session.onLoad();};
 f.src=`${r.url}#${encodeURIComponent(tok)}`;document.body.appendChild(f);
 return{session,frame:f,loads:()=>loads,navigated:()=>navigated,dispose:()=>{window.removeEventListener('message',on);session.dispose();f.remove();closeExtDocuments(PROBE_EXTENSION_ID,panelId);}};
}

async function runPanelProbe(evil:string):Promise<ProbeReport>{
 let rep:ProbeReport|null=null;
 const p=await mountPanel('probe',`<script>${PANEL_PROBE_SCRIPT(evil)}<\/script>`,r=>{rep=r;});
 for(let i=0;i<100&&!rep;i++)await wait(100);
 p.dispose();
 return rep??fail('panel produced no report (inline bridge or script blocked)');
}

async function runNavigationProbe(targets:Record<string,string>):Promise<NavReport>{
 const out:NavReport={targets:{}};
 for(const [name,raw] of Object.entries(targets)){
  let target=raw;
  if(raw==='app-origin')target=location.href;
  else if(raw==='somnia-ext-other'){const o=await openPanelDocument(PROBE_EXTENSION_ID,'other','<p>other</p>');target=o.url;}
  else if(raw==='blob')target=URL.createObjectURL(new Blob(['<p>blob</p>'],{type:'text/html'}));
  else if(raw==='redirect-into-scheme')target=`https://evil.invalid/redirect?to=${encodeURIComponent('somnia-ext://panel/x/y')}`;
  // The panel navigates itself after the host answered its hello (so the session is bound before navigation).
  const script=`addEventListener('message',e=>{if(e.data&&e.data.type==='somnia.port'){setTimeout(()=>{location.href=${JSON.stringify(target)};},50);}});`;
  const p=await mountPanel('nav-'+name,`<script>${script}<\/script>`,()=>{});
  await wait(2500);
  // navigated: the frame produced a second load (host guard killed the session). denied: the session no longer has a port, so nothing from the navigated document can call the host API.
  const navigated=p.navigated()||p.loads()>1;
  out.targets[name]={navigated,api_after_navigation_denied:!p.session.alive&&!p.session.bound};
  p.dispose();
  if(raw==='blob')URL.revokeObjectURL(target);
 }
 return out;
}

/** Called once at startup in desktop builds. A no-op unless the Rust side reports the env var (needs the `ext-selftest` cargo feature). */
export async function maybeRunNativeSelftest():Promise<void>{
 let env:SelftestEnv|null=null;
 try{env=await invoke<SelftestEnv|null>('selftest_env');}catch{return;}
 if(!env||!env.out)return;
 const ev=env.evil||'https://evil.invalid';
 const ports:SelftestPorts={platform:navigator.userAgent,appVersion:'dev',
  runWorkerProbe:()=>runWorkerProbe(ev),runPanelProbe:()=>runPanelProbe(ev),runNavigationProbe:t=>runNavigationProbe(t),
  writeFile:(path,content)=>invoke('selftest_write',{path,content}),exit:code=>{void invoke('selftest_exit',{code});}};
 await runExtSelftest({[SELFTEST_ENV]:env.out},ports,ev.replace(/^https?:\/\//,'').replace(/[:/].*$/,''));
}
