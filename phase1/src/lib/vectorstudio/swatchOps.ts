import {swatchColor,SWATCH_LIMIT,type VectorDocument} from '../vectorio';
const need=(c:unknown)=>{const v=swatchColor(c);if(!v)throw new RangeError('color must be #rgb or #rrggbb');return v;};
/** Adds one colour to the document palette. Duplicates and the 64-swatch limit are errors, not silent no-ops. */
export function addSwatch(doc:VectorDocument,color:unknown):VectorDocument{
 const c=need(color),cur=doc.swatches??[];
 if(cur.includes(c))throw Error('That swatch already exists');
 if(cur.length>=SWATCH_LIMIT)throw Error(`At most ${SWATCH_LIMIT} swatches`);
 return {...doc,swatches:[...cur,c]};
}
export function removeSwatch(doc:VectorDocument,color:unknown):VectorDocument{
 const c=need(color),cur=doc.swatches??[];
 if(!cur.includes(c))throw Error('No such swatch');
 const {swatches:_s,...rest}=doc,next=cur.filter(x=>x!==c);return next.length?{...rest,swatches:next}:rest;
}
/** The colour to apply; it must be in the palette so the command cannot paint with a typo. */
export function swatchToApply(doc:VectorDocument,color:unknown):string{
 const c=need(color);if(!(doc.swatches??[]).includes(c))throw Error('No such swatch');return c;
}
