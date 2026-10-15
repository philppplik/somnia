import {checkDocsUrl} from './shell/docsLinks';
/** Opens a manifest docs link through the existing openExternal (loaded lazily). Re-checks the URL here (fail-closed) even though
 *  manifests are resolved earlier, so no caller can reach the system browser with an unchecked URL. Returns false when refused. */
export async function openDocsLink(url:unknown,open?:(u:string)=>Promise<void>):Promise<boolean>{
 const c=checkDocsUrl(url);if(!c.ok)return false;
 await (open??(await import('./openExternal')).openExternal)(c.url);return true;
}
