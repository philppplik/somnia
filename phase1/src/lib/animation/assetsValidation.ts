import {validateInterfaceAssets} from '../interface/assetsCore';
import type {InterfaceDocument} from '../interface/schema';
import {validateAudioAssets,type AudioAsset} from './audioCore';
/** Reuse Interface's signature, canonical PNG, pixel and aggregate byte limits, including recovery. */
export function validateAnimationAssets(doc:{readonly assets?:readonly {readonly id:string}[];readonly audioAssets?:readonly AudioAsset[];readonly compositions?:readonly {readonly layers?:readonly {readonly kind?:string;readonly source?:{readonly assetId?:string};readonly audio?:{readonly assetId?:string}}[]}[]}){
 validateInterfaceAssets({assets:doc.assets,nodes:[]} as unknown as InterfaceDocument);
 validateAudioAssets(doc.audioAssets);
 const audioIds=new Set(doc.audioAssets?.map(a=>a.id));
 const ids=new Set(doc.assets?.map(a=>a.id));
 for(const c of doc.compositions??[])for(const l of c.layers??[])if(l.kind==='raster'&&!ids.has(l.source?.assetId??''))throw Error('Image layer has missing asset.');
 else if(l.kind==='audio'&&!audioIds.has(l.audio?.assetId??''))throw Error('Audio layer has missing asset.');
}
