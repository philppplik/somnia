/**
 * PBR extras (emissive, opacity, alpha mode) and texture slots. Pure validation, no three.js, so it runs under tsx --test.
 * Texture files are checked from their bytes before anything decodes them: type by signature, size, and pixel count.
 */
export const ALPHA_MODES=['opaque','blend','mask'] as const;
export type AlphaMode=typeof ALPHA_MODES[number];
export interface PbrExtras{emissive?:string;emissiveIntensity?:number;opacity?:number;alphaMode?:AlphaMode;alphaCutoff?:number;doubleSided?:boolean}
export class MaterialError extends Error{constructor(message:string){super(message);this.name='MaterialError';}}
const HEX=/^#[0-9a-fA-F]{6}$/;
export const MAX_EMISSIVE_INTENSITY=20;
/**
 * Layer model for the inspector material swatch, computed from the PBR values alone (no render, no assets):
 * the base colour, a roughness-driven highlight (tinted white on dielectrics, smaller and brighter on metals)
 * and a glow layer while emissive is on. The panel draws it as SVG, so no inline styles are needed.
 */
export interface MaterialSwatch{base:string;highlight:{color:string;opacity:number;r:number};glow:{color:string;opacity:number}|null}
export function materialSwatch(m:{color:string;metalness:number;roughness:number;emissive?:string;emissiveIntensity?:number}):MaterialSwatch{
 const rough=Math.min(1,Math.max(0,m.roughness));
 const metal=Math.min(1,Math.max(0,m.metalness));
 const glowOn=!!m.emissive&&(m.emissiveIntensity??0)>0&&m.emissive!.toLowerCase()!=='#000000';
 return {
  base:m.color,
  highlight:{color:'#ffffff',opacity:Math.round((1-rough)*55+(metal>0.5?15:0))/100,r:metal>0.5?5:8},
  glow:glowOn?{color:m.emissive!,opacity:Math.min(0.85,Math.round((0.35+(m.emissiveIntensity??0)*0.15)*100)/100)}:null,
 };
}
/** Fallback emissive for a preset saved from a material that reports none. */
export const DEFAULT_PRESET_EMISSIVE='#000000';
const range=(v:unknown,min:number,max:number,what:string):number=>{
 if(typeof v!=='number'||!Number.isFinite(v))throw new MaterialError(`${what} must be a finite number.`);
 if(v<min||v>max)throw new MaterialError(`${what} must be between ${min} and ${max}.`);return v;
};
/** Validates one patch. Returns it unchanged when every given field is in range. */
export function checkPbr(p:PbrExtras):PbrExtras{
 if(p.emissive!==undefined&&(typeof p.emissive!=='string'||!HEX.test(p.emissive)))throw new MaterialError('emissive must look like #rrggbb.');
 if(p.emissiveIntensity!==undefined)range(p.emissiveIntensity,0,MAX_EMISSIVE_INTENSITY,'emissiveIntensity');
 if(p.opacity!==undefined)range(p.opacity,0,1,'opacity');
 if(p.alphaCutoff!==undefined)range(p.alphaCutoff,0,1,'alphaCutoff');
 if(p.alphaMode!==undefined&&!(ALPHA_MODES as readonly string[]).includes(p.alphaMode))throw new MaterialError(`alphaMode must be one of ${ALPHA_MODES.join(', ')}.`);
 if(p.doubleSided!==undefined&&typeof p.doubleSided!=='boolean')throw new MaterialError('doubleSided must be true or false.');
 return p;
}
export interface AlphaState{transparent:boolean;opacity:number;alphaTest:number;depthWrite:boolean}
/** How the three.js material fields follow from glTF-style alpha mode. Opaque ignores opacity, mask cuts at the cutoff, blend fades. */
export function alphaState(mode:AlphaMode,opacity:number,cutoff:number):AlphaState{
 if(mode==='opaque')return{transparent:false,opacity:1,alphaTest:0,depthWrite:true};
 if(mode==='mask')return{transparent:false,opacity,alphaTest:Math.max(cutoff,1e-4),depthWrite:true};
 return{transparent:true,opacity,alphaTest:0,depthWrite:opacity>=1};
}
export function alphaModeOf(transparent:boolean,alphaTest:number):AlphaMode{return alphaTest>0?'mask':transparent?'blend':'opaque';}
export const TEXTURE_SLOTS=['color','normal','roughness','metal','emissive'] as const;
export type TextureSlot=typeof TEXTURE_SLOTS[number];
export const isTextureSlot=(v:unknown):v is TextureSlot=>typeof v==='string'&&(TEXTURE_SLOTS as readonly string[]).includes(v);
/** Which material property a slot fills, and whether the image holds colour (sRGB) or data. */
export const SLOT_CONFIG:Record<TextureSlot,{prop:'map'|'normalMap'|'roughnessMap'|'metalnessMap'|'emissiveMap';srgb:boolean}>={
 color:{prop:'map',srgb:true},normal:{prop:'normalMap',srgb:false},roughness:{prop:'roughnessMap',srgb:false},metal:{prop:'metalnessMap',srgb:false},emissive:{prop:'emissiveMap',srgb:true},
};
export const MAX_TEXTURE_FILE_BYTES=32*1024*1024;
export const MAX_TEXTURE_DIM=8192;
export const MAX_TEXTURE_PIXELS=36_000_000;
export interface ImageInfo{mime:'image/png'|'image/jpeg'|'image/webp';width:number;height:number}
const u16=(b:Uint8Array,o:number)=>(b[o]<<8)|b[o+1];
const u32=(b:Uint8Array,o:number)=>((b[o]*2**24)+(b[o+1]<<16)+(b[o+2]<<8)+b[o+3]);
const le24=(b:Uint8Array,o:number)=>b[o]|(b[o+1]<<8)|(b[o+2]<<16);
/** Reads type and size from the file header only. Throws a readable error for anything that is not a PNG, JPEG or WebP within limits. */
export function inspectImage(name:string,bytes:Uint8Array):ImageInfo{
 if(bytes.byteLength>MAX_TEXTURE_FILE_BYTES)throw new MaterialError(`${name} is larger than ${MAX_TEXTURE_FILE_BYTES/1048576} MB.`);
 let info:ImageInfo|null=null;
 const ascii=(o:number,s:string)=>[...s].every((c,i)=>bytes[o+i]===c.charCodeAt(0));
 if(bytes.length>=24&&bytes[0]===0x89&&ascii(1,'PNG')&&ascii(12,'IHDR'))info={mime:'image/png',width:u32(bytes,16),height:u32(bytes,20)};
 else if(bytes.length>4&&bytes[0]===0xff&&bytes[1]===0xd8){
  let o=2;
  while(o+9<bytes.length){
   if(bytes[o]!==0xff){o++;continue;}
   const m=bytes[o+1];if(m===0xff){o++;continue;}
   if(m>=0xc0&&m<=0xcf&&m!==0xc4&&m!==0xc8&&m!==0xcc){info={mime:'image/jpeg',height:u16(bytes,o+5),width:u16(bytes,o+7)};break;}
   if(m===0xd8||(m>=0xd0&&m<=0xd7)||m===0x01){o+=2;continue;}
   o+=2+u16(bytes,o+2);
  }
 }else if(bytes.length>=30&&ascii(0,'RIFF')&&ascii(8,'WEBP')){
  if(ascii(12,'VP8X'))info={mime:'image/webp',width:le24(bytes,24)+1,height:le24(bytes,27)+1};
  else if(ascii(12,'VP8L')&&bytes[20]===0x2f){const b=bytes[21]|(bytes[22]<<8)|(bytes[23]<<16)|(bytes[24]*2**24);info={mime:'image/webp',width:(b&0x3fff)+1,height:((b>>>14)&0x3fff)+1};}
  else if(ascii(12,'VP8 ')&&bytes[23]===0x9d&&bytes[24]===0x01&&bytes[25]===0x2a)info={mime:'image/webp',width:(bytes[26]|(bytes[27]<<8))&0x3fff,height:(bytes[28]|(bytes[29]<<8))&0x3fff};
 }
 if(!info)throw new MaterialError(`${name} is not a PNG, JPEG or WebP image.`);
 if(!(info.width>0&&info.height>0))throw new MaterialError(`${name} has no readable size.`);
 if(info.width>MAX_TEXTURE_DIM||info.height>MAX_TEXTURE_DIM||info.width*info.height>MAX_TEXTURE_PIXELS)throw new MaterialError(`${name} is ${info.width} x ${info.height}. The limit is ${MAX_TEXTURE_DIM} pixels per side and ${MAX_TEXTURE_PIXELS/1_000_000} million pixels in total.`);
 return info;
}
