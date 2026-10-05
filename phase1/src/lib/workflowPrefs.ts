export interface WorkflowPrefs{startup:'last'|'welcome'|'blank';documentTitle:string;confirmDelete:boolean;draftAutosave:boolean;draftSeconds:number}
export const DEFAULT_WORKFLOW_PREFS:WorkflowPrefs={startup:'last',documentTitle:'Untitled',confirmDelete:false,draftAutosave:true,draftSeconds:3};
const KEY='somnia.workflowPrefs.v1';
export function sanitizeWorkflowPrefs(x:any):WorkflowPrefs{return {startup:x?.startup==='welcome'||x?.startup==='blank'?x.startup:'last',documentTitle:typeof x?.documentTitle==='string'&&x.documentTitle.trim()?x.documentTitle.trim().slice(0,160):'Untitled',confirmDelete:x?.confirmDelete===true,draftAutosave:x?.draftAutosave!==false,draftSeconds:typeof x?.draftSeconds==='number'&&Number.isFinite(x.draftSeconds)?Math.max(1,Math.min(300,x.draftSeconds)):3};}
export function readWorkflowPrefs():WorkflowPrefs{try{return sanitizeWorkflowPrefs(JSON.parse(localStorage.getItem(KEY)||'{}'));}catch{return {...DEFAULT_WORKFLOW_PREFS};}}
export function saveWorkflowPrefs(p:WorkflowPrefs){try{localStorage.setItem(KEY,JSON.stringify(p));}catch{/* session only */}}
export function escapeTitle(title:string){return title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
