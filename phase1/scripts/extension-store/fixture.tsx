import {createRoot} from 'react-dom/client';
import '../../src/styles/global.css';
import '../../src/styles/bento.css';
import '../../src/styles/extensions-popup.css';
import '../../src/styles/extensions-store.css';
import {ExtensionsPopup} from '../../src/components/extensions/ExtensionsPopup';
import {ExtensionConsentHost} from '../../src/components/extensions/ExtensionConsentHost';
import {PermissionBroker} from '../../src/lib/extensions/permissionBroker';
import {configureConsentBroker} from '../../src/lib/extensions/consentUiHost';
import {fixtureHost} from '../../src/lib/extensions/popupFixtures';
import {FIXTURE_INSTALLED,fixtureStoreHost} from '../../src/lib/extensions/storeFixtures';
import type {PopupExtension,PopupView} from '../../src/lib/extensions/popupModel';
import {setLocale} from '../../src/lib/i18n';
/** Screenshot and Playwright harness only. Real components, real consent UI, fixture data. Never ships. */
const q=new URLSearchParams(location.search);
if(q.get('locale'))setLocale(q.get('locale') as never);
if(q.get('theme'))document.documentElement.dataset.theme=q.get('theme')!;
const values=new Map<string,string>();
const broker=new PermissionBroker({getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);}},{invalidate:()=>{}});
configureConsentBroker(broker);broker.acknowledgeFirstRun();
let installed:PopupExtension[]=structuredClone(FIXTURE_INSTALLED);
const log={commits:[] as string[],reports:[] as unknown[],external:[] as string[]};
(window as unknown as {__store:unknown}).__store=log;
const store=fixtureStoreHost({offline:q.has('offline'),unavailable:q.has('unavailable'),stale:q.has('stale'),stageResult:(q.get('stage') as never)??null,reportFails:q.has('reportfails'),missingEvidence:q.get('noevidence')?.split(',')??[],
 onCommit:(id,v)=>{log.commits.push(`${id}@${v}`);const base=installed.find(e=>e.id===id);installed=base?installed.map(e=>e.id===id?{...e,version:v,update:{kind:'current'}}:e):[...installed,{...structuredClone(FIXTURE_INSTALLED[0]),id,name:id,version:v}];},onReport:r=>{log.reports.push(r);}});
const host={...fixtureHost({list:async()=>structuredClone(installed),openExternal:async(u:string)=>{log.external.push(u);}}),store};
createRoot(document.getElementById('root')!).render(<><ExtensionsPopup open host={host} onClose={()=>{}} initial={(q.get('view')??'browse') as PopupView}/><ExtensionConsentHost/></>);
