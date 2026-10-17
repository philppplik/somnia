import {defaultLocalContext,normalizeLocalContext,type LocalContextChoices} from './localAssistant';import type {LocalTask} from './taskRouting';
let state={nativeMode:true,task:'chat' as LocalTask,choices:{...defaultLocalContext},draft:'',disclosureKey:null as string|null,conversationId:crypto.randomUUID() as string};const listeners=new Set<()=>void>();
export const panelPreferencesSnapshot=()=>state;export const subscribePanelPreferences=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
export function setPanelPreferences(patch:Partial<typeof state>){if(patch.choices)normalizeLocalContext(patch.choices);state={...state,...patch};listeners.forEach(f=>f());}
/** Exact session context binding. Approval is one use, no persistence and no provider retargeting. */
export function panelDisclosureKey(scope:{project:number;revision:number;settingsRevision:number;provider:string;model:string;path:string;media:boolean;studio:string;selection:string;documentRef?:string;choices:LocalContextChoices;task:LocalTask}){return JSON.stringify(scope);}
export function consumePanelDisclosure(key:string):boolean{const matches=state.disclosureKey===key;setPanelPreferences({disclosureKey:null});return matches;}
