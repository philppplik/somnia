import {validateInterfaceAssets} from '../interface/assetsCore';
import type {InterfaceDocument} from '../interface/schema';
/** Reuse Interface's signature, canonical PNG, pixel and aggregate byte limits, including recovery. */
export function validateAnimationAssets(doc:{readonly assets?:readonly {readonly id:string}[];readonly compositions?:readonly {readonly layers?:readonly {readonly kind?:string;readonly source?:{readonly assetId?:string}}[]}[]}){
 validateInterfaceAssets({assets:doc.assets,nodes:[]} as unknown as InterfaceDocument);
 const ids=new Set(doc.assets?.map(a=>a.id));
 for(const c of doc.compositions??[])for(const l of c.layers??[])if(l.kind==='raster'&&!ids.has(l.source?.assetId??''))throw Error('Image layer has missing asset.');
}
