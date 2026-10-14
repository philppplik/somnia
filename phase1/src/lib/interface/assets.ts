import {addNode,insideInstance,type InterfaceDocument} from './model';
import type {InterfaceAsset} from './schema';
import {MAX_ASSET_BYTES,MAX_IMAGE_PIXELS,rasterHeader,checkImageDimensions,validateInterfaceAssets} from './assetsCore';
export {MAX_ASSET_BYTES,MAX_IMAGE_PIXELS,rasterHeader,checkImageDimensions,validateInterfaceAssets};
export async function prepareRasterAsset(file:File):Promise<InterfaceAsset>{
 if(file.size>MAX_ASSET_BYTES)throw Error('Image must be under 1 MB.');const bytes=new Uint8Array(await file.arrayBuffer()),header=rasterHeader(bytes);checkImageDimensions(header.width,header.height);
 const bitmap=await createImageBitmap(new Blob([bytes],{type:header.type==='png'?'image/png':'image/jpeg'}));try{checkImageDimensions(bitmap.width,bitmap.height);const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image renderer unavailable.');ctx.drawImage(bitmap,0,0);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Image encoding failed.')),'image/png'));if(blob.size>MAX_ASSET_BYTES)throw Error('Canonical PNG exceeds 1 MB.');const canonical=new Uint8Array(await blob.arrayBuffer());const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',canonical))).map(v=>v.toString(16).padStart(2,'0')).join('');let binary='';for(const byte of canonical)binary+=String.fromCharCode(byte);return {id:`asset-${hash}`,hash,mime:'image/png',width:bitmap.width,height:bitmap.height,data:`data:image/png;base64,${btoa(binary)}`,sourceName:file.name.slice(0,256)||'Image',sourceType:header.type,license:'user-provided-unverified'};}finally{bitmap.close();}
}
export function attachRasterAsset(doc:InterfaceDocument,frameId:string,asset:InterfaceAsset,asFill=false):string{
 const frame=doc.nodes.find(n=>n.id===frameId);if(!frame||frame.kind!=='frame'||frame.locked||insideInstance(doc,frameId))throw Error('Select an unlocked non-instance frame.');
 const existing=doc.assets?.find(a=>a.hash===asset.hash);if(!existing)(doc.assets??=[]).push(asset);const assetId=existing?.id??asset.id;
 if(asFill){frame.imageFill={assetId,fit:'cover'};return frame.id;}
 const id=addNode(doc,frame.pageId,'image',frame.id),node=doc.nodes.find(n=>n.id===id)!;node.name=asset.sourceName;node.width=asset.width;node.height=asset.height;node.imageFill={assetId,fit:'contain'};return id;
}
