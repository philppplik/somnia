/**
 * Photos Studio develop settings: the full control set the LightCraft engine (photos-engine, WASM)
 * really applies, mapped 1:1 onto its DevelopSettings JSON. Nothing here is decorative: every value
 * renders through the engine. Ranges follow the engine's own control table (lightcraft controls.rs).
 */
export interface PhotoCrop {x0:number;y0:number;x1:number;y1:number}
/** Quarter turns clockwise, applied as the engine's orientation transform. */
export type PhotoOrientation = 0|1|2|3;
export interface PhotoSettings {
 exposure:number;      // stops, -5..5
 contrast:number;      // -100..100
 highlights:number;    // -100..100
 shadows:number;       // -100..100
 whites:number;        // -100..100
 blacks:number;        // -100..100
 temp:number;          // Kelvin 2000..50000; 6500 is neutral for JPEG/PNG sources
 tint:number;          // -150..150 (negative = green, positive = magenta)
 vibrance:number;      // -100..100
 saturation:number;    // -100..100
 texture:number;       // -100..100
 clarity:number;       // -100..100
 dehaze:number;        // -100..100
 sharpen:number;       // 0..150
 noiseLuminance:number;// 0..100
 noiseColor:number;    // 0..100
 straighten:number;    // degrees, -45..45 (crop geometry angle)
 orientation:PhotoOrientation;
 flipH:boolean;
 flipV:boolean;
 crop:PhotoCrop|null;  // normalized rect of the oriented frame; null = full frame
}
export const neutralPhotoSettings:PhotoSettings={exposure:0,contrast:0,highlights:0,shadows:0,whites:0,blacks:0,temp:6500,tint:0,vibrance:0,saturation:0,texture:0,clarity:0,dehaze:0,sharpen:0,noiseLuminance:0,noiseColor:0,straighten:0,orientation:0,flipH:false,flipV:false,crop:null};
/** One slider row of the inspector. `key` is the PhotoSettings field; ranges are the engine's. */
export interface PhotoControl {key:keyof PhotoSettings&string;label:string;min:number;max:number;step:number;section:'light'|'color'|'effects'|'detail'|'transform';format?:(v:number)=>string}
const signed=(v:number)=>`${v>0?'+':''}${Math.round(v*100)/100}`;
export const PHOTO_CONTROLS:readonly PhotoControl[]=[
 {key:'exposure',label:'photos.exposure',min:-5,max:5,step:0.05,section:'light',format:signed},
 {key:'contrast',label:'photos.contrast',min:-100,max:100,step:1,section:'light',format:signed},
 {key:'highlights',label:'photos.highlights',min:-100,max:100,step:1,section:'light',format:signed},
 {key:'shadows',label:'photos.shadows',min:-100,max:100,step:1,section:'light',format:signed},
 {key:'whites',label:'photos.whites',min:-100,max:100,step:1,section:'light',format:signed},
 {key:'blacks',label:'photos.blacks',min:-100,max:100,step:1,section:'light',format:signed},
 {key:'temp',label:'photos.temp',min:2000,max:50000,step:50,section:'color',format:v=>`${Math.round(v)} K`},
 {key:'tint',label:'photos.tint',min:-150,max:150,step:1,section:'color',format:signed},
 {key:'vibrance',label:'photos.vibrance',min:-100,max:100,step:1,section:'color',format:signed},
 {key:'saturation',label:'photos.saturation',min:-100,max:100,step:1,section:'color',format:signed},
 {key:'texture',label:'photos.texture',min:-100,max:100,step:1,section:'effects',format:signed},
 {key:'clarity',label:'photos.clarity',min:-100,max:100,step:1,section:'effects',format:signed},
 {key:'dehaze',label:'photos.dehaze',min:-100,max:100,step:1,section:'effects',format:signed},
 {key:'sharpen',label:'photos.sharpen',min:0,max:150,step:1,section:'detail'},
 {key:'noiseLuminance',label:'photos.noiseLuminance',min:0,max:100,step:1,section:'detail'},
 {key:'noiseColor',label:'photos.noiseColor',min:0,max:100,step:1,section:'detail'},
 {key:'straighten',label:'photos.straighten',min:-45,max:45,step:0.1,section:'transform',format:v=>`${signed(v)}°`},
];
const NUMERIC_KEYS=['exposure','contrast','highlights','shadows','whites','blacks','temp','tint','vibrance','saturation','texture','clarity','dehaze','sharpen','noiseLuminance','noiseColor','straighten'] as const;
const RANGES:Record<(typeof NUMERIC_KEYS)[number],[number,number]>=Object.fromEntries(PHOTO_CONTROLS.map(c=>[c.key,[c.min,c.max]])) as never;
const clamp=(v:number,[min,max]:[number,number])=>Math.min(max,Math.max(min,v));
const validCrop=(c:unknown):c is PhotoCrop=>!!c&&typeof c==='object'&&['x0','y0','x1','y1'].every(k=>Number.isFinite((c as never)[k]))&&(c as PhotoCrop).x0>=0&&(c as PhotoCrop).y0>=0&&(c as PhotoCrop).x1<=1&&(c as PhotoCrop).y1<=1&&(c as PhotoCrop).x1>(c as PhotoCrop).x0&&(c as PhotoCrop).y1>(c as PhotoCrop).y0;
/** Strict shape check, then clamps each numeric control into the engine range. Unknown keys throw. */
export function sanitizePhotoSettings(input:PhotoSettings):PhotoSettings {
 const allowed=new Set([...NUMERIC_KEYS,'orientation','flipH','flipV','crop']);
 for(const k of Object.keys(input))if(!allowed.has(k))throw Error(`Unexpected Photos setting: ${k}`);
 const out={...input};
 for(const k of NUMERIC_KEYS){const v=out[k];if(!Number.isFinite(v))throw Error(`Invalid ${k}.`);out[k]=clamp(v,RANGES[k]);}
 if(![0,1,2,3].includes(out.orientation))throw Error('Invalid orientation.');
 if(typeof out.flipH!=='boolean'||typeof out.flipV!=='boolean')throw Error('Invalid flip.');
 if(out.crop!==null&&!validCrop(out.crop))throw Error('Invalid crop.');
 return out;
}
const ORIENTATIONS=['Normal','Rotate90','Rotate180','Rotate270'] as const;
/** Partial DevelopSettings JSON the engine deep-merges over its defaults (see lightcraft settings.rs). */
export function photoSettingsToEngine(s:PhotoSettings){
 return {
  wb:{temp:s.temp,tint:s.tint},
  light:{exposure:s.exposure,contrast:s.contrast,highlights:s.highlights,shadows:s.shadows,whites:s.whites,blacks:s.blacks},
  color:{vibrance:s.vibrance,saturation:s.saturation},
  effects:{texture:s.texture,clarity:s.clarity,dehaze:s.dehaze},
  detail:{sharpen_amount:s.sharpen,nr_luminance:s.noiseLuminance,nr_color:s.noiseColor},
  crop:{geometry:{rect:s.crop??{x0:0,y0:0,x1:1,y1:1},angle:s.straighten},flip_h:s.flipH,flip_v:s.flipV},
  orientation:ORIENTATIONS[s.orientation],
 };
}
/** Stable string for dirty checks and history dedupe; key order is fixed by construction. */
export function photoSignature(s:PhotoSettings){
 const c=s.crop;return JSON.stringify([s.exposure,s.contrast,s.highlights,s.shadows,s.whites,s.blacks,s.temp,s.tint,s.vibrance,s.saturation,s.texture,s.clarity,s.dehaze,s.sharpen,s.noiseLuminance,s.noiseColor,s.straighten,s.orientation,s.flipH,s.flipV,c?[c.x0,c.y0,c.x1,c.y1]:null]);
}
export const isNeutralPhoto=(s:PhotoSettings)=>photoSignature(s)===photoSignature(neutralPhotoSettings);
/** The engine's input contract (photos-engine/src/lib.rs): JPEG/PNG only, no alpha, bounded size. */
export const PHOTO_INPUT={mimes:['image/jpeg','image/png'] as const,accept:'.jpg,.jpeg,.png,image/jpeg,image/png',maxBytes:16*1024*1024,maxPixels:16_777_216,previewEdge:1024,sourceEdge:2048};
export function photoInputError(mime:string):string|null{return (PHOTO_INPUT.mimes as readonly string[]).includes(mime)?null:mime;}
