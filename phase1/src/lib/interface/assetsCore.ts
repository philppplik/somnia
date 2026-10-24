import type {InterfaceDocument} from './schema';
export const MAX_ASSET_BYTES=1_000_000,MAX_IMAGE_PIXELS=4_000_000;
export function rasterHeader(bytes:Uint8Array):{type:'png'|'jpeg';width:number;height:number}{
 if(bytes.length>MAX_ASSET_BYTES||bytes.length<24)throw Error('Image must be under 1 MB.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i])){if(view.getUint32(8)!==13||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw Error('Invalid PNG header.');return {type:'png',width:view.getUint32(16),height:view.getUint32(20)};}
 if(bytes[0]===255&&bytes[1]===216){let offset=2;while(offset+4<bytes.length){if(bytes[offset++]!==255)throw Error('Malformed JPEG.');while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===217||marker===218)break;const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)throw Error('Truncated JPEG.');if([192,193,194].includes(marker)){if(length<8)throw Error('Malformed JPEG dimensions.');return {type:'jpeg',width:view.getUint16(offset+5),height:view.getUint16(offset+3)};}offset+=length;}}
 throw Error('Only bounded PNG and JPEG images are supported.');
}
export function checkImageDimensions(width:number,height:number){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||width*height>MAX_IMAGE_PIXELS)throw Error('Image exceeds 4096px / 4 MP limit.');}
export function validateInterfaceAssets(doc:InterfaceDocument):void{
 const assets=doc.assets??[];if(!Array.isArray(assets)||assets.length>50)throw Error('Invalid image assets.');const ids=new Set<string>();let total=0;
 for(const a of assets){if(!a||typeof a!=='object'||typeof a.hash!=='string'||!(/^[a-f0-9]{64}$/).test(a.hash)||a.id!==`asset-${a.hash}`||ids.has(a.id)||a.mime!=='image/png'||typeof a.data!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(a.data)||a.data.length>1_340_000||typeof a.sourceName!=='string'||!a.sourceName.length||a.sourceName.length>256||!['png','jpeg'].includes(a.sourceType)||a.license!=='user-provided-unverified')throw Error('Invalid embedded image.');checkImageDimensions(a.width,a.height);ids.add(a.id);total+=a.data.length;if(total>3_000_000)throw Error('Embedded image budget exceeded.');const binary=atob(a.data.slice('data:image/png;base64,'.length));const header=rasterHeader(Uint8Array.from(binary,c=>c.charCodeAt(0)));if(header.type!=='png'||header.width!==a.width||header.height!==a.height)throw Error('Image metadata mismatch.');}
 for(const n of doc.nodes){if(n.imageFill!==undefined&&(!n.imageFill||typeof n.imageFill!=='object'||!ids.has(n.imageFill.assetId)||!['cover','contain'].includes(n.imageFill.fit)||!['image','frame','rectangle','ellipse'].includes(n.kind)))throw Error('Invalid image fill.');if(n.kind==='image'&&!n.imageFill)throw Error('Image layer has no asset.');}
}
