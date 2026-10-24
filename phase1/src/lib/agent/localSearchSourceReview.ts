import {chunkLocalSources,type SearchSource} from './localSearch';import {normalizeLocalIndexText} from './localIndexChunks';
/** Identical raw + normalized limits, no hashing/IO and no partial index. */
export function localSearchSourceReview(sources:readonly SearchSource[]):{bytes:number;chunks:number;valid:boolean}{
 let bytes=0;try{bytes=sources.reduce((n,s)=>n+new TextEncoder().encode(s.text).length,0);if(bytes>262144||sources.length>32)return {bytes,chunks:0,valid:false};chunkLocalSources(sources);const chunks=chunkLocalSources(sources.map(s=>({id:s.id,text:normalizeLocalIndexText(s.text)}))).length;return {bytes,chunks,valid:sources.length>0&&chunks>0};}catch{return {bytes,chunks:0,valid:false};}
}
