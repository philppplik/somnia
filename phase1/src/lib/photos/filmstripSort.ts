import type{PhotoNavItem} from './photoNav';
export type FilmstripSort='library'|'rating'|'flag';
export const FILMSTRIP_SORTS:readonly FilmstripSort[]=['library','rating','flag'];
/** Display order for the filmstrip; JS sort is stable, so library order survives inside each rating/flag group. The workspace prev/next navigation keeps library order regardless. */
export function sortFilmstrip<T extends PhotoNavItem>(photos:readonly T[],sort:FilmstripSort,ratings:Record<string,number|undefined>,flags:Record<string,string|null|undefined>):T[]{
 if(sort==='rating')return[...photos].sort((a,b)=>(ratings[b.name]??0)-(ratings[a.name]??0));
 if(sort==='flag'){const rank=(f:string|null|undefined)=>f==='pick'?0:f==='reject'?2:1;return[...photos].sort((a,b)=>rank(flags[a.name])-rank(flags[b.name]));}
 return[...photos];
}
