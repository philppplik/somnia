import {registerStudio,type StudioDef} from './registry';
/**
 * Photos Studio: LightCraft develop (WASM worker) for JPEG/PNG originals. Session-only settings,
 * bounded copy export; originals are never overwritten. PSD is claimed so the studio can say
 * honestly that develop does not cover it yet (the Code studio keeps the read-only PSD preview).
 */
export const photosStudio:StudioDef={
 id:'photos',label:'studio.photos',icon:'Aperture',order:8,
 formats:[...['jpg','jpeg','png'].map(ext=>({ext,mime:ext==='png'?'image/png':'image/jpeg',priority:50})),{ext:'psd',mime:'image/vnd.adobe.photoshop',priority:50}],
 shell:{
  leftRail:[{id:'files',label:'Files',icon:'Files',global:true}],
  rightRail:[{id:'design',label:'Develop',icon:'SlidersHorizontal'}],
  header:{menus:['Project','Edit','View','Tools','Help'],views:[]},
  bottomBar:{slots:[],viewportPresets:[]},
  inspector:'photos.inspector',tools:[]
 },
 commands:[],shortcuts:{'studio.photos':'Mod+7'},menus:{view:[]},canvas:'photos.canvas',
 agent:{tools:['photo_inspect','photo_propose_settings'],contextProviders:['photoDevelopMetadata','photoDevelopSettings'],quickActions:[]},deriveContext:context=>context
};
registerStudio(photosStudio);
