import {hasStudio,type StudioId} from './registry';
/**
 * Smart Open handler registry (docs/concepts/smart-open-routing.md).
 * A handler says: "this Studio can open documents of these validated kinds". The resolver only considers handlers whose
 * Studio is registered at the time of the call, so a queued Studio (Vector, Design, Photos) can be listed here without being
 * advertised: until it registers, its rule is skipped and the next candidate wins.
 */
export type OpenKind='docx'|'xlsx'|'pptx'|'audio'|'video'|'image'|'pdf'|'psd'|'raster-preview'|'svg'|'text';
export interface OpenHandler{
 id:string;studioId:StudioId;kinds:readonly OpenKind[];
 /** Higher wins. Equal priorities between ready handlers are never decided by registration order: the user is asked. */
 priority:number;
 /** 'preview' = read-only. The coordinator reports it as such. */
 capability:'edit'|'preview';
 /** Marks the handler that wins an otherwise equal tie (a product default). */
 isDefault?:boolean;
}
const handlers=new Map<string,OpenHandler>();
export function registerOpenHandler(handler:OpenHandler):()=>void{
 if(handlers.has(handler.id))throw new Error(`Open handler already registered: ${handler.id}`);
 handlers.set(handler.id,handler);return()=>{if(handlers.get(handler.id)===handler)handlers.delete(handler.id);};
}
export const listOpenHandlers=()=>[...handlers.values()];
/** Ready = the Studio exists in the registry right now. */
export const readyHandlersFor=(kind:OpenKind)=>listOpenHandlers().filter(h=>h.kinds.includes(kind)&&hasStudio(h.studioId));
export const handlerForStudio=(kind:OpenKind,studioId:StudioId)=>readyHandlersFor(kind).find(h=>h.studioId===studioId);

// Built-in rules. Studios that are not registered on this branch are skipped by `readyHandlersFor`.
registerOpenHandler({id:'open.documents',studioId:'documents',kinds:['docx'],priority:100,capability:'edit'});
registerOpenHandler({id:'open.sheets',studioId:'sheets',kinds:['xlsx'],priority:100,capability:'edit'});
registerOpenHandler({id:'open.slides',studioId:'slides',kinds:['pptx'],priority:100,capability:'edit'});
registerOpenHandler({id:'open.sound',studioId:'sound',kinds:['audio'],priority:100,capability:'edit'});
registerOpenHandler({id:'open.video',studioId:'video',kinds:['video'],priority:100,capability:'edit'});
// QUEUED (Builder): Vector Studio. Affinity-style svg -> Vector. Needs the strict `vectorio` SVG importer; on incompatible
// SVG the Vector adapter must reject at prepare time so the Code rule below takes over. The rule exists, it is not wired:
// it stays inert until a Studio with id 'vector' registers itself.
registerOpenHandler({id:'open.vector',studioId:'vector',kinds:['svg'],priority:50,capability:'edit'});
// QUEUED (Builder): Photos Studio for raster/psd. Until it registers, raster/pdf/psd keep the existing read-only preview in Code.
registerOpenHandler({id:'open.photos',studioId:'photos',kinds:['image','raster-preview','psd'],priority:50,capability:'edit'});
// Code: verified text and svg source, plus the existing read-only previews. NOT a binary catch-all.
registerOpenHandler({id:'open.code.text',studioId:'code',kinds:['text','svg'],priority:0,capability:'edit'});
registerOpenHandler({id:'open.code.preview',studioId:'code',kinds:['image','raster-preview','psd','pdf'],priority:0,capability:'preview'});
