import type {AssetInventory, Diagnostic, Release} from './types';
import {STORE_LIMITS} from './types';
import {validDigest} from './validation';
/** Inventory authenticity is checked by the signed target adapter, not by this shape check. */
export function validateAssetInventory(value:unknown,release:Release):Diagnostic[] {
 const out:Diagnostic[]=[];const fail=(message:string)=>out.push({code:'ASSET_INVENTORY',path:'assets',message});
 const inventory=value as AssetInventory;
 if(!inventory||inventory.assetSchemaVersion!==1||inventory.extensionId!==release.id||inventory.version!==release.version||inventory.packageSha256!==release.artifact.sha256||!Array.isArray(inventory.derivatives)){fail('Inventory is not bound to this release and package.');return out;}
 if(inventory.derivatives.length>256){fail('Too many generated assets.');return out;}
 const keys=new Set<string>(),screenshots=new Set<number>();let icon=false;
 for(const a of inventory.derivatives){
  if(!a||!['icon','screenshot','cover','glyph'].includes(a.role)||!validDigest(a.sha256)||!validDigest(a.sourceSha256)||a.mime!=='image/png'||!Number.isSafeInteger(a.bytes)||a.bytes<1||a.bytes>48*1024*1024||!Number.isSafeInteger(a.sourceBytes)||a.sourceBytes<1||!Number.isInteger(a.width)||!Number.isInteger(a.height)||a.width<1||a.height<1||a.width>3840||a.height>3840||a.width*a.height>8294400||typeof a.pipelineVersion!=='string'||!a.pipelineVersion||typeof a.key!=='string'||!/^sha256-[a-f0-9]{64}\.png$/.test(a.key)||a.key!==`sha256-${a.sha256}.png`){fail('Invalid generated PNG reference.');continue;}
  if(keys.has(a.key))fail('Duplicate asset key.');keys.add(a.key);
  if(a.role==='icon'){
   if(![16,32,64,128,256,512].includes(a.width)||a.width!==a.height||a.sourceBytes>STORE_LIMITS.iconSourceBytes||a.variant!==undefined&&!['light','dark'].includes(a.variant))fail('Invalid identity derivative.');
   if(a.width===512&&a.variant!=='dark')icon=true;
  }
  if(a.role==='screenshot'){
   if(!Number.isInteger(a.screenshotIndex)||Number(a.screenshotIndex)<0||Number(a.screenshotIndex)>=STORE_LIMITS.screenshots||a.sourceBytes>STORE_LIMITS.screenshotSourceBytes||typeof a.alt!=='string'||!a.alt.trim()||Array.from(a.alt).length>240||/[<>\u0000-\u001f]/.test(a.alt))fail('Invalid screenshot reference or accessible text.');else screenshots.add(a.screenshotIndex!);
  }
  if(a.role==='glyph'&&(!a.glyphKey||!/^[a-z][a-z0-9-]{0,39}$/.test(a.glyphKey)||a.width!==a.height||![16,20,24,32,40,48].includes(a.width)||a.sourceBytes>32768))fail('Invalid glyph mask.');
 }
 if(!icon||screenshots.size<1||screenshots.size>STORE_LIMITS.screenshots)fail('Store needs a 512px identity icon and one to five screenshots.');
 return out;
}
