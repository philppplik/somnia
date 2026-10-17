import {defaultLocalContext,normalizeLocalContext,type LocalContextChoices} from './localAssistant';import type {LocalTask} from './taskRouting';
// The panel is one ongoing conversation, so history reuse is on here by default (the checkbox stays an explicit opt-out); the stricter defaultLocalContext for local-native runs keeps history off.
let state={nativeMode:true,task:'chat' as LocalTask,choices:{...defaultLocalContext,history:true},draft:'',disclosureKey:null as string|null};const listeners=new Set<()=>void>();
export const panelPreferencesSnapshot=()=>state;export const subscribePanelPreferences=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
export function setPanelPreferences(patch:Partial<typeof state>){if(patch.choices)normalizeLocalContext(patch.choices);state={...state,...patch};listeners.forEach(f=>f());}
/** Exact session context binding. Approval is one use, no persistence and no provider retargeting. */
export function panelDisclosureKey(scope:{project:number;revision:number;settingsRevision:number;provider:string;model:string;path:string;media:boolean;studio:string;selection:string;documentRef?:string;choices:LocalContextChoices;task:LocalTask}){return JSON.stringify(scope);}
export function consumePanelDisclosure(key:string):boolean{const matches=state.disclosureKey===key;setPanelPreferences({disclosureKey:null});return matches;}
