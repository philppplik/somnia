import type {RailItemDef,StudioLayout} from '../shell/types';
import {registerRailIcons} from '../shell/railIcons';
import {Undo2,Redo2,Download} from '../icons';
/**
 * Slides studio rails for the studio shell (docs/concepts/studio-shell.md, sections 3.4 and 9.4).
 * Data only: items point at panel ids declared in `shellV2.panels` (SLIDES_PANEL_IDS is the contract between the rail
 * and lib/slides/panelDefinitions.ts) and at icon names in the rail icon registry.
 *
 * Icons follow "the same function keeps the same glyph in every studio" (concept 3.6), so they match Documents:
 *  Files Files | Slides overview (thumbnails) Copy, as Documents "Pages" | Outline Hash | Search Search |
 *  Versions VersionsIcon | Inspector Presentation.
 * Only Undo2, Redo2 and Download are not in the shared set yet; `registerSlidesRailIcons` adds them (first wins).
 *
 * Left: Files, Slides, Outline, Search, Versions, then deck commands. "Save a copy" is pinned; Undo/Redo start in the
 * overflow menu because Edit menu, shortcuts and the palette already reach them. Commands carry no `when`: their own
 * `enabled` state (busy, nothing to undo) greys them out.
 * Right: the generic inspector (`shell.inspector`) only; its sections (slide text, presentation, compatibility) are declared in
 * `slidesInspector`, so there is one rail item. Presentation is the glyph Slides already uses for the studio.
 */
export const SLIDES_PANEL_IDS={left:['overview','outline'],right:['inspector']} as const;
/** Panels every file studio shares: they reuse the Code hosts, exactly as Documents does. */
export const SLIDES_GLOBAL_PANEL_IDS=['files','search','versions'] as const;
export const SLIDES_RAIL_LABEL_KEYS:Record<string,string>={
 overview:'slides.rail.overview',outline:'slides.rail.outline',inspector:'slides.rail.inspector',
 saveCopy:'slides.rail.saveCopy',undo:'slides.rail.undo',redo:'slides.rail.redo',
};
const L=(id:string,label:string)=>({id,label,...(SLIDES_RAIL_LABEL_KEYS[id]?{labelKey:SLIDES_RAIL_LABEL_KEYS[id]}:{})});
export const SLIDES_LEFT_RAIL:readonly RailItemDef[]=[
 {id:'files',icon:'Files',label:'Files',kind:'panel',panel:'files',order:10},
 {...L('overview','Slides'),icon:'Copy',kind:'panel',panel:'overview',order:20},
 {...L('outline','Outline'),icon:'Hash',kind:'panel',panel:'outline',order:30},
 {id:'search',icon:'Search',label:'Search',kind:'panel',panel:'search',order:40},
 {id:'versions',icon:'VersionsIcon',label:'Versions',kind:'panel',panel:'versions',order:50},
 {...L('saveCopy','Save a copy'),icon:'Download',kind:'command',command:'slides.saveCopy',order:100,movable:true},
 {...L('undo','Undo text'),icon:'Undo2',kind:'command',command:'slides.undo',order:110,defaultPinned:false,movable:true},
 {...L('redo','Redo text'),icon:'Redo2',kind:'command',command:'slides.redo',order:120,defaultPinned:false,movable:true},
];
export const SLIDES_RIGHT_RAIL:readonly RailItemDef[]=[
 {...L('inspector','Presentation'),icon:'Presentation',kind:'panel',panel:'inspector',order:10},
];
/** First open: the slide overview on the left, the inspector (slide text, presentation, compatibility sections) on the right (the pre-v2 Slides layout). */
export const SLIDES_DEFAULT_LAYOUT:StudioLayout={leftOpen:true,rightOpen:true,leftWidth:260,rightWidth:320,leftPanels:['overview'],rightPanels:['inspector'],activeLeft:'overview',activeRight:'inspector'};
let registered=false;
/** Idempotent. First-wins registry, so calling twice or after another studio is harmless. */
export function registerSlidesRailIcons(){if(registered)return;registered=true;registerRailIcons({Undo2,Redo2,Download});}
registerSlidesRailIcons();
