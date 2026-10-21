import {getRegisteredLifecycleAdapter} from '../lifecycle/adapters';
import {registerStudio,type StudioDef} from './registry';
import type {StudioShellDef} from '../shell/types';
import {PHOTOS_LEFT_RAIL,PHOTOS_RIGHT_RAIL} from '../photos/shellRail';
import {PHOTOS_EXTRA_RAIL,PHOTOS_PANELS,PHOTOS_PANEL_LAYOUT} from '../photos/panelManifest';
/** Pure data. Hosts live in components/photos/panels (registerStudioPanels). Right rail order: Histogram, Light..Transform, Presets, Export. */
export const photosShell:StudioShellDef={
 panels:PHOTOS_PANELS,leftRail:PHOTOS_LEFT_RAIL,
 rightRail:[...PHOTOS_RIGHT_RAIL,...PHOTOS_EXTRA_RAIL].sort((a,b)=>a.order-b.order),
 defaultLayout:PHOTOS_PANEL_LAYOUT,
};
/**
 * Photos Studio: LightCraft develop (WASM worker) for JPEG/PNG originals. Session-only settings,
 * bounded copy export; originals are never overwritten. PSD is claimed so the studio can say
 * honestly that develop does not cover it yet (the Code studio keeps the read-only PSD preview).
 */
export const photosStudio:StudioDef={
 lifecycle:()=>getRegisteredLifecycleAdapter('photos'),
 id:'photos',label:'studio.photos',icon:'Aperture',order:8,
 formats:[...['jpg','jpeg','png'].map(ext=>({ext,mime:ext==='png'?'image/png':'image/jpeg',priority:50})),{ext:'psd',mime:'image/vnd.adobe.photoshop',priority:50}],
 shell:{
  leftRail:[{id:'files',label:'Files',icon:'Files',global:true}],
  rightRail:[{id:'design',label:'Develop',icon:'SlidersHorizontal'}],
  header:{heroAction:{id:'photos.export.open',labelKey:'photos.hero.export',disabledLabelKey:'photos.hero.disabled',icon:'Download',menu:['photos.export.png','photos.export.jpeg']},menus:['Project','Edit','View','Tools','Help'],views:[]},
  bottomBar:{slots:[],viewportPresets:[]},
  inspector:'photos.inspector',tools:[]
 },
 commands:[],shortcuts:{'studio.photos':'Mod+7'},menus:{view:[]},canvas:'photos.canvas',shellV2:photosShell,
 agent:{tools:['photo_inspect','photo_propose_settings'],contextProviders:['photoDevelopMetadata','photoDevelopSettings'],quickActions:[]},deriveContext:context=>context,lifecycle:()=>getRegisteredLifecycleAdapter('photos')
};
registerStudio(photosStudio);
