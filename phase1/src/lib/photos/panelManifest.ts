import type {PanelDef,RailItemDef,StudioLayout} from '../shell/types';
/**
 * Photos Studio side panels: pure data. Hosts (React) live in components/photos/panels and are registered under
 * the same ids (`photos.<id>`). Nothing here depends on a claimed StudioContext: every panel reads the active
 * photo session itself and shows an honest empty state when no photo is open, so no `when` is needed.
 * Rail items for these panels are owned by the rail work; `PHOTOS_PANEL_IDS` is the list they point at.
 */
const STUDIO='photos';
const panel=(id:string,side:'left'|'right',icon:string,commands:readonly string[],extra:Partial<PanelDef>={}):PanelDef=>({
 id,title:id[0].toUpperCase()+id.slice(1),titleKey:`photos.panel.${id}`,component:`${STUDIO}.${id}`,side,icon,placement:'rail',commands,persistKey:`${STUDIO}.${id}`,...extra,
});
export const PHOTOS_PANELS:readonly PanelDef[]=[
 panel('histogram','right','Histogram',['photos.getHistogram'],{defaultOpen:true,minHeight:230}),
 panel('curves','right','Curves',['photos.setAdjustment','photos.resetAdjustments'],{minHeight:330}),
 panel('hsl','right','Palette',['photos.setAdjustment','photos.resetAdjustments'],{minHeight:300}),
 panel('mask','right','Eclipse',[],{minHeight:340}),
 panel('light','right','DevelopLight',['photos.setAdjustment','photos.resetAdjustments'],{defaultOpen:true,minHeight:260}),
 panel('color','right','DevelopColor',['photos.setAdjustment','photos.resetAdjustments'],{defaultOpen:true,minHeight:230}),
 panel('effects','right','DevelopEffects',['photos.setAdjustment','photos.resetAdjustments'],{minHeight:200}),
 panel('detail','right','DevelopDetail',['photos.setAdjustment','photos.resetAdjustments'],{minHeight:200}),
 panel('transform','right','DevelopTransform',['photos.rotate','photos.flip','photos.crop.start','photos.crop.apply','photos.crop.cancel','photos.crop.setAspect','photos.crop.swapAspect','photos.crop.reset','photos.setAdjustment'],{minHeight:320}),
 panel('presets','right','Presets',['photos.applyLook','photos.resetAdjustments'],{minHeight:300}),
 panel('export','right','Download',['photos.export'],{minHeight:150}),
 panel('history','left','History',['photos.undo','photos.redo','photos.history.jump'],{minHeight:200}),
 panel('info','left','Info',['photos.getState'],{minHeight:220}),
];
/** Panel ids of this module. The rail work (shellRail.ts) owns the items for light..transform, history and info. */
export const PHOTOS_PANEL_HOST_IDS=PHOTOS_PANELS.map(p=>p.id);
/** Rail items for the panels shellRail.ts does not cover. Orders slot around its 10..50 develop items. */
export const PHOTOS_EXTRA_RAIL:readonly RailItemDef[]=[
 {id:'histogram',icon:'Histogram',label:'Histogram',labelKey:'photos.panel.histogram',kind:'panel',panel:'histogram',order:5},
 {id:'curves',icon:'Curves',label:'Curves',labelKey:'photos.panel.curves',kind:'panel',panel:'curves',order:7},
 {id:'hsl',icon:'Palette',label:'Mixer',labelKey:'photos.panel.hsl',kind:'panel',panel:'hsl',order:8},
 {id:'mask',icon:'Eclipse',label:'Mask',labelKey:'photos.panel.mask',kind:'panel',panel:'mask',order:9},
 {id:'presets',icon:'Presets',label:'Presets',labelKey:'photos.panel.presets',kind:'panel',panel:'presets',order:60},
 {id:'export',icon:'Download',label:'Export',labelKey:'photos.panel.export',kind:'panel',panel:'export',order:70},
];
/**
 * First-open layout: canvas keeps the room. Right side open on Histogram and Light, left side closed.
 * (shellRail.ts opens Light only; the histogram is the quick read that makes the sliders useful.)
 */
export const PHOTOS_PANEL_LAYOUT:StudioLayout={leftOpen:false,rightOpen:true,leftWidth:260,rightWidth:320,leftPanels:[],rightPanels:['histogram','light'],activeRight:'light'};
/** Every command id the panels use (unique), for the shell validator and the inventory test. */
export const PHOTOS_PANEL_COMMANDS=[...new Set(PHOTOS_PANELS.flatMap(p=>p.commands??[]))].sort();
