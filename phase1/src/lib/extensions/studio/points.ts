/** Studio extension points (PoC, see docs/extensions/14-studio-extension-points.md). Data only: what each Studio lets extensions plug into. The host owns this table; extensions never extend it. */
export type StudioPointId='code'|'documents'|'sheets'|'slides'|'sound'|'photos';
/** Host-owned places a panel may appear. Panels never replace a rail, toolbox or canvas. */
export type PanelSlot='rail-left'|'rail-right'|'inspector-section'|'flyout'|'bottom-drawer';
/** Interchange models: the only data an importer returns or an exporter receives. */
export type InterchangeKind='files'|'blocks'|'cells'|'slides'|'pcm'|'raster';
export interface StudioPoint{
 id:StudioPointId;
 /** false when the Studio is not registered in the app yet (Photos at 1d014e1). Contributions validate but never mount. */
 mounted:boolean;
 interchange:InterchangeKind;
 /** Slots the Studio exposes. Fewer slots means the Studio keeps the space for its own tools. */
 slots:readonly PanelSlot[];
 /** Selection kinds an inspector section or command may target with `when`. */
 selectionKinds:readonly string[];
 /** Operation types a section may emit. The Studio's own transaction layer applies them (undoable, one history entry per section action). */
 operations:readonly string[];
 canImport:boolean;canExport:boolean;
}
export const STUDIO_POINTS:Readonly<Record<StudioPointId,StudioPoint>>=Object.freeze({
 code:{id:'code',mounted:true,interchange:'files',slots:['rail-left','rail-right','inspector-section','bottom-drawer'],selectionKinds:['element','text-range','file'],operations:['formatText','setText','setAttribute','setStyle','insertHTML','remove','move'],canImport:true,canExport:true},
 documents:{id:'documents',mounted:true,interchange:'blocks',slots:['rail-right','inspector-section','bottom-drawer'],selectionKinds:['caret','text-range','block','table'],operations:['setBlockText','setBlockStyle','insertBlock','removeBlock','setRunStyle'],canImport:true,canExport:true},
 sheets:{id:'sheets',mounted:true,interchange:'cells',slots:['rail-right','inspector-section','bottom-drawer'],selectionKinds:['cell','range','column','row','sheet'],operations:['setCell','setRange','setFormat','insertRows','insertColumns'],canImport:true,canExport:true},
 slides:{id:'slides',mounted:true,interchange:'slides',slots:['rail-right','inspector-section','flyout'],selectionKinds:['slide','shape','text-range'],operations:['setShapeText','setShapeStyle','insertShape','removeShape','reorderSlide'],canImport:true,canExport:true},
 sound:{id:'sound',mounted:true,interchange:'pcm',slots:['inspector-section','bottom-drawer'],selectionKinds:['track','region','cursor'],operations:['applyEffect','trim','gain'],canImport:true,canExport:true},
 photos:{id:'photos',mounted:false,interchange:'raster',slots:['inspector-section','flyout'],selectionKinds:['layer','selection','document'],operations:['setAdjustment','applyFilter','setLayerProps'],canImport:true,canExport:true},
});
export const isStudioPointId=(v:unknown):v is StudioPointId=>typeof v==='string'&&Object.prototype.hasOwnProperty.call(STUDIO_POINTS,v);
/** Hard caps for converter traffic. Importers and exporters are untrusted code, so every bound is enforced by the host. */
export const LIMITS={maxBytesIn:64*1024*1024,maxBytesOut:128*1024*1024,converterTimeoutMs:30000,maxSlotsPerSlot:4,maxSectionsPerStudio:8,maxFields:24};
