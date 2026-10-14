/** Procedural texture patterns as raw RGBA pixels - no three.js, so every pattern is testable in Node and the viewport stays the only three consumer. */
export type TexgenKind='checker'|'grid'|'stripes'|'noise';
export interface TexgenSpec{kind:TexgenKind;/** Texture edge length in pixels (16..1024). */size?:number;/** Pattern cells across the texture (1..64). */scale?:number;/** Primary color as #rrggbb. */colorA?:string;/** Secondary color as #rrggbb. */colorB?:string;/** Noise seed (1..1e9). */seed?:number;}
export interface TexgenImage{width:number;height:number;data:Uint8Array;}
export class TexgenError extends Error{name='TexgenError';}

const parseColor=(s:string|undefined,fallback:[number,number,number]):[number,number,number]=>{
 if(s===undefined)return fallback;
 if(!/^#[0-9a-fA-F]{6}$/.test(s))throw new TexgenError('Colors must be given as #rrggbb.');
 return[parseInt(s.slice(1,3),16),parseInt(s.slice(3,5),16),parseInt(s.slice(5,7),16)];
};
/** Seeded value noise: integer-lattice random values, smoothly interpolated (Perlin-style fade), one octave plus a half-frequency octave for structure. */
const lattice=(seed:number,x:number,y:number)=>{
 let h=(x*374761393+y*668265263+seed*1013904223)>>>0;
 h=(h^(h>>>13))>>>0;h=Math.imul(h,1274126177)>>>0;
 return((h^(h>>>16))>>>0)/4294967295;
};
const fade=(t:number)=>t*t*(3-2*t);
const valueNoise=(seed:number,x:number,y:number)=>{
 const xi=Math.floor(x),yi=Math.floor(y),xf=fade(x-xi),yf=fade(y-yi);
 const a=lattice(seed,xi,yi),b=lattice(seed,xi+1,yi),c=lattice(seed,xi,yi+1),d=lattice(seed,xi+1,yi+1);
 return a+(b-a)*xf+(c-a)*yf+(a-b-c+d)*xf*yf;
};
export const TEXGEN_DEFAULT_COLORS={a:'#f0f0f0',b:'#18181c'} as const;

export function generateTexture(spec:TexgenSpec):TexgenImage{
 const size=spec.size??256,scale=spec.scale??8,seed=spec.seed??1;
 if(!Number.isInteger(size)||size<16||size>1024)throw new TexgenError('The texture size must be a whole number of pixels between 16 and 1024.');
 if(!Number.isFinite(scale)||scale<1||scale>64)throw new TexgenError('The pattern scale must be between 1 and 64 cells.');
 if(!Number.isInteger(seed)||seed<1||seed>1e9)throw new TexgenError('The noise seed must be a whole number between 1 and 1000000000.');
 const A=parseColor(spec.colorA,[240,240,240]),B=parseColor(spec.colorB,[24,24,28]);
 const data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size;
  let t:number;
  switch(spec.kind){
   case 'checker':t=(Math.floor(u*scale)+Math.floor(v*scale))%2===0?0:1;break;
   case 'grid':{const fu=u*scale%1,fv=v*scale%1,th=0.5/scale;t=(fu<th||fv<th)?1:0;break;}
   case 'stripes':t=Math.floor(u*scale)%2===0?0:1;break;
   case 'noise':{const n=valueNoise(seed,u*scale,v*scale)*0.7+valueNoise(seed*2+1,u*scale*2,v*scale*2)*0.3;t=n;break;}
  }
  const i=(y*size+x)*4;
  data[i]=Math.round(A[0]+(B[0]-A[0])*t);
  data[i+1]=Math.round(A[1]+(B[1]-A[1])*t);
  data[i+2]=Math.round(A[2]+(B[2]-A[2])*t);
  data[i+3]=255;
 }
 return{width:size,height:size,data};
}
