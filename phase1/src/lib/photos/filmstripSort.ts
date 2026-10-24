import type{PhotoNavItem} from './photoNav';
export type FilmstripSort='library'|'rating'|'flag'|'capture'|'name'|'size';
export const FILMSTRIP_SORTS:readonly FilmstripSort[]=['library','rating','flag','capture','name','size'];
/** Display order for the filmstrip; JS sort is stable, so library order survives inside each rating/flag group. The workspace prev/next navigation keeps library order regardless. */
export function sortFilmstrip<T extends PhotoNavItem>(photos:readonly T[],sort:FilmstripSort,ratings:Record<string,number|undefined>,flags:Record<string,string|null|undefined>,dates?:Record<string,number|null|undefined>,sizes?:Record<string,number|undefined>):T[]{
 if(sort==='capture'&&dates){ // dated photos oldest-first, undated keep library order at the end; JS sort is stable
  const t=(n:string)=>{const v=dates[n];return typeof v==='number'?v:null;};
  return[...photos].sort((a,b)=>{const x=t(a.name),y=t(b.name);if(x===null&&y===null)return 0;if(x===null)return 1;if(y===null)return -1;return x-y;});
 }
 if(sort==='name')return[...photos].sort((a,b)=>a.name.localeCompare(b.name));
 if(sort==='size'&&sizes)return[...photos].sort((a,b)=>(sizes[b.name]??0)-(sizes[a.name]??0)); // big files first: duplicate candidates land side by side
 if(sort==='rating')return[...photos].sort((a,b)=>(ratings[b.name]??0)-(ratings[a.name]??0));
 if(sort==='flag'){const rank=(f:string|null|undefined)=>f==='pick'?0:f==='reject'?2:1;return[...photos].sort((a,b)=>rank(flags[a.name])-rank(flags[b.name]));}
 return[...photos];
}
