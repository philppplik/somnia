import GraphemeSplitter from './unicodeFallback';
/** Pinned Unicode 10 grapheme fallback (grapheme-splitter 1.0.4, MIT).
 * Intl.Segmenter uses the platform Unicode version when available. */
const Splitter=GraphemeSplitter as unknown as {new():{splitGraphemes(text:string):string[]}};
const splitter=new Splitter();
export function segmentGraphemes(text:string,forceFallback=false):string[]{
 const Segmenter=(Intl as unknown as {Segmenter?:new(locale?:string,options?:{granularity:string})=>{segment(s:string):Iterable<{segment:string}>}}).Segmenter;
 return !forceFallback&&Segmenter?Array.from(new Segmenter('und',{granularity:'grapheme'}).segment(text),s=>s.segment):splitter.splitGraphemes(text);
}
export function extensionInitials(name:string,forceFallback=false):string {
 const words=name.trim().split(/\s+/u).map(w=>segmentGraphemes(w,forceFallback).filter(g=>/[\p{L}\p{N}]/u.test(g))).filter(w=>w.length);
 const initials=words.length>1?words[0][0]+words[1][0]:words[0]?.slice(0,2).join('')??'';
 return segmentGraphemes(initials.toUpperCase(),forceFallback).slice(0,2).join('')||'EX';
}
export const IDENTITY_SIZES=Object.freeze([16,32,64,128,256,512]);
export const GLYPH_SIZES=Object.freeze([16,20,24,32,40,48]);
export function derivativeSize(cssSize:number,dpr=2,glyph=false):number {
 const sizes=glyph?GLYPH_SIZES:IDENTITY_SIZES;
 const target=Math.max(1,Number.isFinite(cssSize)?cssSize:24)*(Number.isFinite(dpr)&&dpr>0?dpr:2);
 return sizes.find(s=>s>=target)??sizes[sizes.length-1];
}
export type RasterHandle={digest:string;width:number;height:number;handle:string};
/** Input handles belong to an authenticated host inventory, never manifest paths. */
export function identityCandidates(light:readonly RasterHandle[],dark:readonly RasterHandle[]|undefined,mode:'light'|'dark',size:number,dpr=2):RasterHandle[]{
 if(size<24)return[];
 const choose=(list:readonly RasterHandle[])=>list.filter(a=>a.width===a.height&&IDENTITY_SIZES.includes(a.width)&&/^[a-f0-9]{64}$/.test(a.digest)).sort((a,b)=>a.width-b.width).find(a=>a.width>=derivativeSize(size,dpr));
 const normal=choose(light),night=mode==='dark'&&dark?choose(dark):undefined;
 return [night,normal].filter((v):v is RasterHandle=>!!v).filter((v,i,a)=>a.findIndex(x=>x.digest===v.digest)===i);
}
/** Per-release bounded load state: dark -> normal once -> initials. A new instance
 * is made for a new inventory or explicit retry; no original/network recovery. */
export class IdentityLoadState {
 private failed=new Set<string>();
 fail(digest:string){this.failed.add(digest);}
 select(candidates:readonly RasterHandle[]):RasterHandle|undefined{return candidates.find(a=>!this.failed.has(a.digest));}
}
