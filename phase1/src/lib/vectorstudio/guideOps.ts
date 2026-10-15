import {normalizeGuides,GUIDE_LIMIT,type Guides,type VectorDocument} from '../vectorio';
export type GuideAxis='x'|'y';
const ok=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e6;
const r3=(v:number)=>Math.round(v*1000)/1000;
/** Add (only `to`), remove (only `from`) or move (both) one guide. Unknown `from`, duplicates and the 100-guide limit are errors, never silent no-ops. */
export function moveGuide(doc:VectorDocument,axis:GuideAxis,from?:number,to?:number):VectorDocument{
 if(axis!=='x'&&axis!=='y')throw new RangeError('axis must be x or y');
 if(from===undefined&&to===undefined)throw new RangeError('from or to is required');
 if(from!==undefined&&!ok(from))throw new RangeError('from must be a finite number');
 if(to!==undefined&&!ok(to))throw new RangeError('to must be a finite number');
 const cur:Guides={x:[...(doc.guides?.x??[])],y:[...(doc.guides?.y??[])]},list=cur[axis];
 if(from!==undefined){const i=list.indexOf(r3(from));if(i<0)throw Error('No such guide');list.splice(i,1);}
 if(to!==undefined){const t=r3(to);if(list.includes(t))throw Error('A guide is already there');if(cur.x.length+cur.y.length>=GUIDE_LIMIT)throw Error(`At most ${GUIDE_LIMIT} guides`);list.push(t);}
 const {guides:_g,...rest}=doc,n=normalizeGuides(cur);return n?{...rest,guides:n}:rest;
}
export function clearGuides(doc:VectorDocument):VectorDocument{if(!doc.guides)throw Error('No guides');const {guides:_g,...rest}=doc;return rest;}
