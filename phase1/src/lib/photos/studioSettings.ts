import {clampSpot,spotSignature,validSpot,type HealSpot} from './healSpots';
import {clampDab,dabSignature,validDab,MAX_DABS,type MaskDab,clampGrad,gradSignature,validGrad,MAX_GRADS,type GradFilter,clampRad,radSignature,validRad,MAX_RADS,type RadFilter} from './localAdjust';
import {emptyCurves,validCurves,sanitizeCurvePoints,curvesSignature,type PhotoCurves} from './curves';
import {clampStroke,validStroke,brushSignature,MAX_BRUSH_STROKES,MAX_BRUSH_TOTAL_DABS,brushTotalDabs,type BrushStroke} from './brushStrokes';
import {clampLumMask,validLumMask,lumMaskSignature,neutralLumMask,type LumMask} from './lumMask';
import {neutralHsl,validHsl,clampBand,hslSignature,HSL_BANDS,type PhotoHsl} from './hslMixer';
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
 spots:HealSpot[];      // clone-stamp strokes stamped into the source before the engine loads it
 dabs:MaskDab[];        // local-adjustment mask dabs, applied to the source before the engine loads it
 localEV:number;        // mask brighten/darken in stops, -1..1
 localSat:number;       // mask saturation, -100..100
 grads:GradFilter[];    // linear graduated filters, applied to the source before the engine loads it
 gradEV:number;         // gradient brighten/darken in stops, -1..1
 gradSat:number;        // gradient saturation, -100..100
 rads:RadFilter[];      // radial (elliptical) filters, sharing the gradient strengths
 curves:PhotoCurves;    // tone curves per channel, applied to the source before the engine loads it
 hsl:PhotoHsl;          // per-hue-band color mixer, applied to the source before the engine loads it
 brushes:BrushStroke[]; // adjustment-brush strokes with per-stroke ev/temp/sat, rastered into the source before the engine loads it
 vignetteAmount:number;   // lens correction: -100..100, positive brightens corners (correction), negative darkens (effect)
 vignetteMidpoint:number; // 0..100, where the elliptical falloff starts (0=center, 100=only the far edge)
 defringe:number;         // 0..100, desaturates purple/green fringes at contrast edges
 lumMask:LumMask;         // one luminosity/colour-range mask, rastered into the source between brushes and curves
}
export const neutralPhotoSettings:PhotoSettings={exposure:0,contrast:0,highlights:0,shadows:0,whites:0,blacks:0,temp:6500,tint:0,vibrance:0,saturation:0,texture:0,clarity:0,dehaze:0,sharpen:0,noiseLuminance:0,noiseColor:0,straighten:0,orientation:0,flipH:false,flipV:false,crop:null,spots:[],dabs:[],localEV:0,localSat:0,grads:[],gradEV:0,gradSat:0,rads:[],curves:emptyCurves(),hsl:neutralHsl(),brushes:[],vignetteAmount:0,vignetteMidpoint:50,defringe:0,lumMask:neutralLumMask()};
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
 {key:'vignetteAmount',label:'photos.vignetteAmount',min:-100,max:100,step:1,section:'effects',format:signed},
 {key:'vignetteMidpoint',label:'photos.vignetteMidpoint',min:0,max:100,step:1,section:'effects'},
 {key:'defringe',label:'photos.defringe',min:0,max:100,step:1,section:'detail'},
];
const NUMERIC_KEYS=['exposure','contrast','highlights','shadows','whites','blacks','temp','tint','vibrance','saturation','texture','clarity','dehaze','sharpen','noiseLuminance','noiseColor','straighten','vignetteAmount','vignetteMidpoint','defringe'] as const;
const RANGES:Record<(typeof NUMERIC_KEYS)[number],[number,number]>=Object.fromEntries(PHOTO_CONTROLS.map(c=>[c.key,[c.min,c.max]])) as never;
const clamp=(v:number,[min,max]:[number,number])=>Math.min(max,Math.max(min,v));
const validCrop=(c:unknown):c is PhotoCrop=>!!c&&typeof c==='object'&&['x0','y0','x1','y1'].every(k=>Number.isFinite((c as never)[k]))&&(c as PhotoCrop).x0>=0&&(c as PhotoCrop).y0>=0&&(c as PhotoCrop).x1<=1&&(c as PhotoCrop).y1<=1&&(c as PhotoCrop).x1>(c as PhotoCrop).x0&&(c as PhotoCrop).y1>(c as PhotoCrop).y0;
/** Strict shape check, then clamps each numeric control into the engine range. Unknown keys throw. */
export function sanitizePhotoSettings(input:PhotoSettings):PhotoSettings {
 const allowed=new Set([...NUMERIC_KEYS,'orientation','flipH','flipV','crop','spots','dabs','localEV','localSat','grads','gradEV','gradSat','rads','curves','hsl','brushes','lumMask']);
 for(const k of Object.keys(input))if(!allowed.has(k))throw Error(`Unexpected Photos setting: ${k}`);
 const out={...input};
 for(const k of NUMERIC_KEYS){const v=out[k];if(!Number.isFinite(v))throw Error(`Invalid ${k}.`);out[k]=clamp(v,RANGES[k]);}
 if(![0,1,2,3].includes(out.orientation))throw Error('Invalid orientation.');
 if(typeof out.flipH!=='boolean'||typeof out.flipV!=='boolean')throw Error('Invalid flip.');
 if(out.crop!==null&&!validCrop(out.crop))throw Error('Invalid crop.');
 const spots=(input.spots??[]) as unknown[];
 if(!Array.isArray(spots)||spots.length>200)throw Error('Invalid spots.');
 out.spots=spots.map(sp=>{if(!validSpot(sp))throw Error('Invalid spot.');return clampSpot(sp);});
 const dabs=(input.dabs??[]) as unknown[];
 if(!Array.isArray(dabs)||dabs.length>MAX_DABS)throw Error('Invalid dabs.');
 out.dabs=dabs.map(d=>{if(!validDab(d))throw Error('Invalid dab.');return clampDab(d);});
 if(!Number.isFinite(out.localEV))throw Error('Invalid localEV.');out.localEV=clamp(out.localEV,[-1,1]);
 if(!Number.isFinite(out.localSat))throw Error('Invalid localSat.');out.localSat=clamp(out.localSat,[-100,100]);
 const grads=(input.grads??[]) as unknown[];
 if(!Array.isArray(grads)||grads.length>MAX_GRADS)throw Error('Invalid grads.');
 out.grads=grads.map(g=>{if(!validGrad(g))throw Error('Invalid grad.');return clampGrad(g);});
 if(!Number.isFinite(out.gradEV))throw Error('Invalid gradEV.');out.gradEV=clamp(out.gradEV,[-1,1]);
 if(!Number.isFinite(out.gradSat))throw Error('Invalid gradSat.');out.gradSat=clamp(out.gradSat,[-100,100]);
 const brushes=(input.brushes??[]) as unknown[];
 if(!Array.isArray(brushes)||brushes.length>MAX_BRUSH_STROKES)throw Error('Invalid brushes.');
 out.brushes=brushes.map(b=>{if(!validStroke(b))throw Error('Invalid brush stroke.');return clampStroke(b);});
 if(brushTotalDabs(out.brushes)>MAX_BRUSH_TOTAL_DABS)throw Error('Too many brush dabs.');
 const lm=input.lumMask??neutralLumMask();
 if(!validLumMask(lm))throw Error('Invalid luminosity mask.');
 out.lumMask=clampLumMask(lm);
 const rads=(input.rads??[]) as unknown[];
 if(!Array.isArray(rads)||rads.length>MAX_RADS)throw Error('Invalid rads.');
 out.rads=rads.map(r=>{if(!validRad(r))throw Error('Invalid rad.');return clampRad(r);});
 const curves=input.curves??emptyCurves();
 if(!validCurves(curves))throw Error('Invalid curves.');
 out.curves={master:sanitizeCurvePoints(curves.master),red:sanitizeCurvePoints(curves.red),green:sanitizeCurvePoints(curves.green),blue:sanitizeCurvePoints(curves.blue)};
 const hsl=input.hsl??neutralHsl();
 if(!validHsl(hsl))throw Error('Invalid hsl.');
 out.hsl=Object.fromEntries(HSL_BANDS.map(b=>[b,clampBand(hsl[b])])) as PhotoHsl;
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
 const c=s.crop;return JSON.stringify([s.exposure,s.contrast,s.highlights,s.shadows,s.whites,s.blacks,s.temp,s.tint,s.vibrance,s.saturation,s.texture,s.clarity,s.dehaze,s.sharpen,s.noiseLuminance,s.noiseColor,s.straighten,s.orientation,s.flipH,s.flipV,c?[c.x0,c.y0,c.x1,c.y1]:null,spotSignature(s.spots??[]),dabSignature(s.dabs??[]),s.localEV??0,s.localSat??0,gradSignature(s.grads??[]),s.gradEV??0,s.gradSat??0,radSignature(s.rads??[]),curvesSignature(s.curves??emptyCurves()),hslSignature(s.hsl??neutralHsl()),brushSignature(s.brushes??[]),s.vignetteAmount??0,s.vignetteMidpoint??50,s.defringe??0,lumMaskSignature(s.lumMask??neutralLumMask())]);
}
export const isNeutralPhoto=(s:PhotoSettings)=>photoSignature(s)===photoSignature(neutralPhotoSettings);
/** The engine's input contract (photos-engine/src/lib.rs): JPEG/PNG only, no alpha, bounded size. */
export const PHOTO_INPUT={mimes:['image/jpeg','image/png'] as const,accept:'.jpg,.jpeg,.png,image/jpeg,image/png',maxBytes:16*1024*1024,maxPixels:16_777_216,previewEdge:1024,sourceEdge:2048};
export function photoInputError(mime:string):string|null{return (PHOTO_INPUT.mimes as readonly string[]).includes(mime)?null:mime;}
