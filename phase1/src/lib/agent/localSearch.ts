export interface SearchSource {id:string;text:string}
export interface SearchChunk {sourceId:string;index:number;text:string}
const bytes=(text:string)=>new TextEncoder().encode(text).byteLength;
/** Explicit text only; no source acquisition or silent truncation. */
export function chunkLocalSources(sources:readonly SearchSource[],maxChunkBytes=2048):SearchChunk[]{
 if(!Array.isArray(sources)||sources.length>32||!Number.isSafeInteger(maxChunkBytes)||maxChunkBytes<64||maxChunkBytes>4096)throw Error('Invalid search scope');
 const ids=new Set<string>();let total=0;const chunks:SearchChunk[]=[];
 for(const s of sources){if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!['id','text'].includes(k))||typeof s.id!=='string'||!s.id.trim()||s.id.length>100||/[\x00-\x1f\x7f]/.test(s.id)||ids.has(s.id)||typeof s.text!=='string'||/[\uD800-\uDFFF]/u.test(s.text)||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s.text))throw Error('Invalid explicit source');ids.add(s.id);total+=bytes(s.text);if(total>262144)throw Error('Selected source bytes exceed limit');let text='',size=0,index=0;for(const c of s.text){const n=bytes(c);if(size+n>maxChunkBytes){chunks.push({sourceId:s.id,index:index++,text});text='';size=0;}text+=c;size+=n;}if(text)chunks.push({sourceId:s.id,index,text});if(chunks.length>256)throw Error('Selected chunks exceed limit');}
 return chunks;
}
export interface EmbeddedChunk {chunk:SearchChunk;vector:readonly number[]}
/** Similarity only, not a factual confidence/permission score. No mutation or effects. */
export function rankLocalChunks(query:readonly number[],entries:readonly EmbeddedChunk[],limit=10):Array<{chunk:SearchChunk;score:number}>{
 const valid=(v:readonly number[])=>Array.isArray(v)&&v.length>0&&v.length<=4096&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6)&&v.some(n=>n!==0);
 if(!valid(query)||!Array.isArray(entries)||entries.length>256||!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('Invalid embedding search');
 const norm=(v:readonly number[])=>Math.sqrt(v.reduce((sum,n)=>sum+n*n,0)),qn=norm(query);
 return entries.map((entry,order)=>{if(!entry||!valid(entry.vector)||entry.vector.length!==query.length||!entry.chunk||Object.keys(entry).some(k=>!['chunk','vector'].includes(k))||Object.keys(entry.chunk).some(k=>!['sourceId','index','text'].includes(k))||typeof entry.chunk.text!=='string'||typeof entry.chunk.sourceId!=='string'||!Number.isSafeInteger(entry.chunk.index)||entry.chunk.index<0||bytes(entry.chunk.text)>4096)throw Error('Invalid chunk vector');const score=entry.vector.reduce((sum:number,n:number,i:number)=>sum+n*query[i],0)/(qn*norm(entry.vector));return {chunk:{...entry.chunk},score:Math.max(-1,Math.min(1,score)),order};}).sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,limit).map(({order,...result})=>result);
}
