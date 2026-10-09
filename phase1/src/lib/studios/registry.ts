/** Studios describe editor workspaces. Document buffers/history remain in editor-core. */
export type StudioId = string;
export type StudioViewMode = 'design'|'split'|'code';
export interface FormatClaim {ext:string;mime?:string;priority:number}
export interface RailItem<T extends string=string> {id:T;label:string;icon:string;global?:boolean}
export interface StudioCommand {id:string;label:string}
export interface StudioTool {id:string;command:string}
export interface StudioDef {
 id:StudioId;label:string;icon:string;order:number;formats:readonly FormatClaim[];
 shell:{leftRail:readonly RailItem<'layers'|'files'|'search'|'assets'|'components'|'css'|'versions'>[];rightRail:readonly RailItem<'design'|'prototype'|'code'>[];
  header:{menus:readonly ('Project'|'Edit'|'View'|'Insert'|'Tools'|'Help')[];views:readonly {mode:StudioViewMode;icon:string;command:string}[]};
  sidebar?:string;bottomBar:{viewportPresets:readonly {width:number;icon:string;label:string}[];slots:readonly string[]};inspector:string;tools:readonly StudioTool[]};
 commands:readonly StudioCommand[];shortcuts:Readonly<Record<string,string>>;menus:{view:readonly string[]};canvas:string;
 agent:{tools:readonly string[];contextProviders:readonly string[];quickActions:readonly string[]};
 /** Adapter hook: preserves the existing context derivation, rather than guessing document state. */
 deriveContext:<T>(context:T)=>T;
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
