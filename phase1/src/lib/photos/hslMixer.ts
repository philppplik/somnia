/** HSL color mixer: per-hue-band adjustments, baked into the source before the engine loads it - same
 * preprocessing family as heal spots, mask dabs, graduated/radial filters and the tone curves, so preview,
 * copy export and histogram stay one image. Pure math: no DOM, no engine. */
export interface HslBand{hue:number;sat:number;lum:number;} // each -100..100, 0 = neutral
export const HSL_BANDS=['red','orange','yellow','green','aqua','blue','purple','magenta'] as const;
export type HslBandId=typeof HSL_BANDS[number];
export type PhotoHsl=Record<HslBandId,HslBand>;
/** Band centers in degrees of sRGB hue. */
export const HSL_CENTERS:Record<HslBandId,number>={red:0,orange:30,yellow:60,green:120,aqua:180,blue:240,purple:275,magenta:315};
/** Slider scales: hue +-100 shifts up to +-60 degrees, sat +-100 scales saturation 0x..2x, lum +-100 adds +-0.25 of lightness. */
export const HSL_HUE_DEG=60,HSL_LUM_ADD=0.25;

const clamp=(v:number,[min,max]:[number,number])=>Math.min(max,Math.max(min,v));
export const NEUTRAL_BAND:HslBand={hue:0,sat:0,lum:0};
export const neutralHsl=():PhotoHsl=>Object.fromEntries(HSL_BANDS.map(b=>[b,{...NEUTRAL_BAND}])) as PhotoHsl;
export const hslNeutral=(h:PhotoHsl)=>HSL_BANDS.every(b=>{const v=h[b];return !v||(v.hue===0&&v.sat===0&&v.lum===0);});
export const bandNeutral=(b:HslBand)=>b.hue===0&&b.sat===0&&b.lum===0;

export function validHsl(h:unknown):h is PhotoHsl{
 if(!h||typeof h!=='object')return false;
 const q=h as Record<string,unknown>;
 if(!Object.keys(q).every(k=>(HSL_BANDS as readonly string[]).includes(k)))return false; // unknown bands throw like unknown settings keys
 return HSL_BANDS.every(b=>{const v=q[b] as HslBand|undefined;
  return !!v&&typeof v==='object'&&Number.isFinite(v.hue)&&Number.isFinite(v.sat)&&Number.isFinite(v.lum)&&v.hue>=-100&&v.hue<=100&&v.sat>=-100&&v.sat<=100&&v.lum>=-100&&v.lum<=100;});
}
export const clampBand=(b:HslBand):HslBand=>({hue:clamp(b.hue,[-100,100]),sat:clamp(b.sat,[-100,100]),lum:clamp(b.lum,[-100,100])});

/** Triangular window of a band: 1 at its center, falling linearly to 0 at each neighbor's center.
 * The eight windows partition the hue circle - at every hue the weights of all bands sum to exactly 1,
 * so neighboring band adjustments blend instead of stacking or gapping. */
export function bandWeight(band:HslBandId,h:number):number{
 const c=HSL_CENTERS[band];const i=HSL_BANDS.indexOf(band);
 const prev=HSL_CENTERS[HSL_BANDS[(i+HSL_BANDS.length-1)%HSL_BANDS.length]],next=HSL_CENTERS[HSL_BANDS[(i+1)%HSL_BANDS.length]];
 const off=((h-c)%360+360)%360; // 0..360, hue relative to the center
 const rightSpan=((next-c)%360+360)%360,leftSpan=((c-prev)%360+360)%360; // center-to-center spans
 if(off<=180)return off<rightSpan&&rightSpan>0?1-off/rightSpan:0;
 const dLeft=360-off;return dLeft<leftSpan&&leftSpan>0?1-dLeft/leftSpan:0;
}

/** sRGB (0..255) to HSL (h degrees, s/l 0..1). Achromatic pixels return h=0 and are skipped by the mixer. */
export function rgbToHsl(r:number,g:number,b:number):[number,number,number]{
 const rn=r/255,gn=g/255,bn=b/255,mx=Math.max(rn,gn,bn),mn=Math.min(rn,gn,bn),l=(mx+mn)/2,d=mx-mn;
 if(d===0)return[0,0,l];
 const s=l>0.5?d/(2-mx-mn):d/(mx+mn);
 let h=mx===rn?((gn-bn)/d)%6:mx===gn?(bn-rn)/d+2:(rn-gn)/d+4;
 h*=60;if(h<0)h+=360;
 return[h,s,l];
}
export function hslToRgb(h:number,s:number,l:number):[number,number,number]{
 const c=(1-Math.abs(2*l-1))*s,hp=(((h%360)+360)%360)/60,x=c*(1-Math.abs(hp%2-1)),m=l-c/2;
 const seg=Math.floor(hp)%6;
 const[rn,gn,bn]=seg===0?[c,x,0]:seg===1?[x,c,0]:seg===2?[0,c,x]:seg===3?[0,x,c]:seg===4?[x,0,c]:[c,0,x];
 return[Math.round((rn+m)*255),Math.round((gn+m)*255),Math.round((bn+m)*255)];
}

/** Applies the mixer on a copy of the frame (the input is never mutated). A neutral mixer returns the input
 * frame untouched; achromatic pixels (saturation ~ 0, hue undefined) always pass through. */
export function applyHsl(frame:{bytes:ArrayBuffer;width:number;height:number},hsl:PhotoHsl):{bytes:ArrayBuffer;width:number;height:number}{
 if(hslNeutral(hsl))return frame;
 const bands=HSL_BANDS.map(b=>({w:HSL_CENTERS[b]>=0?b:b,adj:hsl[b]??NEUTRAL_BAND})); // fixed band order
 const out=frame.bytes.slice(0);const px=new Uint8Array(out);
 for(let o=0;o+3<px.length;o+=4){
  if(px[o+3]===0)continue;
  const[h,s,l]=rgbToHsl(px[o],px[o+1],px[o+2]);
  if(s<0.004)continue; // achromatic: hue is undefined, no band applies
  let dh=0,ds=0,dl=0;
  for(const{w,adj}of bands){
   if(bandNeutral(adj))continue;
   const weight=bandWeight(w,h);if(weight<=0)continue;
   dh+=weight*(adj.hue/100)*HSL_HUE_DEG;ds+=weight*(adj.sat/100);dl+=weight*(adj.lum/100)*HSL_LUM_ADD;
  }
  if(dh===0&&ds===0&&dl===0)continue;
  const[r,g,b]=hslToRgb(h+dh,Math.min(1,Math.max(0,s*(1+ds))),Math.min(1,Math.max(0,l+dl)));
  px[o]=r;px[o+1]=g;px[o+2]=b;
 }
 return{bytes:out,width:frame.width,height:frame.height};
}
/** Fixed swatch dots for the band buttons (theme-independent, like the histogram channel colors).
 * Lives here and not in the panel tsx so the components hex ratchet stays put. */
export const HSL_SWATCH:Record<HslBandId,string>={red:'#e5484d',orange:'#f76b15',yellow:'#ffc53d',green:'#30a46c',aqua:'#00a2c7',blue:'#3e63dd',purple:'#8e4ec6',magenta:'#d6409f'};
/** Stable identity of the mixer: drives the engine reload invariant and the settings signature. */
export const hslSignature=(h:PhotoHsl)=>JSON.stringify(HSL_BANDS.map(b=>{const v=h[b]??NEUTRAL_BAND;return[v.hue,v.sat,v.lum];}));
