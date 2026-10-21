/** Studios describe editor workspaces. Document buffers/history remain in editor-core. */
export type StudioId = string;
export type StudioViewMode = 'design'|'split'|'code';
/** A mode must point to a real command; switching never creates a document. */
export interface StudioMode {
 id:string;
 label:string;
 command:string;
 /** Existing Code canvas view, when the mode uses that host. */
 viewMode?:StudioViewMode;
}
export interface FormatClaim {ext:string;mime?:string;priority:number}
export interface RailItem<T extends string=string> {id:T;label:string;icon:string;global?:boolean}
export interface StudioCommand {id:string;label:string}
export interface StudioTool {id:string;command:string}
export interface StudioDef {
 modes?:readonly StudioMode[];
 id:StudioId;label:string;icon:string;order:number;formats:readonly FormatClaim[];
 shell:{leftRail:readonly RailItem<'layers'|'files'|'search'|'assets'|'components'|'css'|'versions'>[];rightRail:readonly RailItem<'design'|'prototype'|'code'>[];
  header:{menus:readonly ('Project'|'Edit'|'View'|'Insert'|'Tools'|'Help')[];views:readonly {mode:StudioViewMode;icon:string;command:string}[];/** Optional hero action. No field keeps the Publish button. */heroAction?:import('../shell/types').HeroActionDef};
  sidebar?:string;bottomBar:{viewportPresets:readonly {width:number;icon:string;label:string}[];slots:readonly string[]};inspector:string;tools:readonly StudioTool[]};
 commands:readonly StudioCommand[];shortcuts:Readonly<Record<string,string>>;menus:{view:readonly string[]};canvas:string;
 agent:{tools:readonly string[];contextProviders:readonly string[];quickActions:readonly string[]};
 /** Adapter hook: preserves the existing context derivation, rather than guessing document state. */
 deriveContext:<T>(context:T)=>T;
 /** Optional lifecycle hooks (docs/studio-lifecycle.md). Studios without them stay fully resident. */
 lifecycle?:()=>import('../lifecycle/types').StudioLifecycleAdapter|undefined;
 /** Shell v2 manifest (optional until the studio is migrated, M2-M6). Old manifests compile unchanged. */
 shellV2?:import('../shell/types').StudioShellDef;
 agentV2?:import('../shell/types').StudioAgentDefV2;
}
const registry=new Map<StudioId,StudioDef>();
export function registerStudio(studio:StudioDef):()=>void {
 if(registry.has(studio.id))throw new Error(`Studio already registered: ${studio.id}`);
 registry.set(studio.id,studio);return()=>{if(registry.get(studio.id)===studio)registry.delete(studio.id);};
}
export const listStudios=()=>[...registry.values()].sort((a,b)=>a.order-b.order);
export function getStudio(id:StudioId):StudioDef {const studio=registry.get(id);if(!studio)throw new Error(`Studio not loaded: ${id}`);return studio;}
/** No shell takeover and no unfinished-module placeholders. Register only runtime-ready modules. */
export function acceptsFormat(studio:StudioDef,path:string):boolean {
 const ext=path.split('.').pop()?.toLowerCase()??'';return studio.formats.some(f=>f.ext===ext||f.ext==='*');
}
export const hasStudio=(id:StudioId)=>registry.has(id);
