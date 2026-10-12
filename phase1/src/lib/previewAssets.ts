/** Binary project assets (images, fonts, audio, video) for the sandboxed live preview.
 * The iframe has an opaque origin and a CSP without network, so local files are inlined as data: URLs.
 * This module holds the pure parts: path resolution, type allow-list, URL rewriting. Loading and caching live in previewAssetCache.ts. */
export type PreviewAssetKind='image'|'font'|'media';
/** Bytes, or a base64 data: URL as produced by the project resource resolver. Either one is enough. */
export interface PreviewAsset{bytes?:Uint8Array;dataUrl?:string;mime?:string}
/** Resolves one project-relative path to bytes. Null when the file is missing or unreadable. Provided by the project resource resolver. */
export type PreviewAssetLoader=(path:string)=>Promise<PreviewAsset|null>;
/** Only these types are ever loaded. The mime comes from the extension, never from the loader, so a mislabelled file cannot widen what the iframe renders. */
const TYPES:Record<string,{mime:string;kind:PreviewAssetKind}>={
 png:{mime:'image/png',kind:'image'},jpg:{mime:'image/jpeg',kind:'image'},jpeg:{mime:'image/jpeg',kind:'image'},jfif:{mime:'image/jpeg',kind:'image'},gif:{mime:'image/gif',kind:'image'},webp:{mime:'image/webp',kind:'image'},avif:{mime:'image/avif',kind:'image'},bmp:{mime:'image/bmp',kind:'image'},ico:{mime:'image/x-icon',kind:'image'},svg:{mime:'image/svg+xml',kind:'image'},
 woff2:{mime:'font/woff2',kind:'font'},woff:{mime:'font/woff',kind:'font'},ttf:{mime:'font/ttf',kind:'font'},otf:{mime:'font/otf',kind:'font'},
 mp4:{mime:'video/mp4',kind:'media'},m4v:{mime:'video/mp4',kind:'media'},webm:{mime:'video/webm',kind:'media'},ogv:{mime:'video/ogg',kind:'media'},mov:{mime:'video/quicktime',kind:'media'},
 mp3:{mime:'audio/mpeg',kind:'media'},wav:{mime:'audio/wav',kind:'media'},ogg:{mime:'audio/ogg',kind:'media'},oga:{mime:'audio/ogg',kind:'media'},m4a:{mime:'audio/mp4',kind:'media'},aac:{mime:'audio/aac',kind:'media'},flac:{mime:'audio/flac',kind:'media'},opus:{mime:'audio/ogg',kind:'media'},
};
export function assetType(path:string):{mime:string;kind:PreviewAssetKind}|null{const m=/\.([a-z0-9]+)$/i.exec(path);return m?TYPES[m[1].toLowerCase()]??null:null;}
/** Directives appended to the preview CSP. Only data: (plus the existing blob: for images) is allowed, so nothing can reach the network. blob: URLs made by the parent do not load in the opaque-origin sandbox (verified in Chromium), so assets are always inlined as data: URLs. */
export const PREVIEW_ASSET_CSP="img-src data: blob:; font-src data:; media-src data:";
/** Resolves a reference relative to the file that contains it. Null for absolute, scheme, protocol-relative and root-relative references. */
export function resolveProjectPath(base:string,href:string):string|null{
 if(/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(href.trim()))return null;
 let raw=href.split(/[?#]/)[0];try{raw=decodeURIComponent(raw);}catch{/* keep raw */}
 if(!raw)return null;
 const out:string[]=[];for(const p of [...base.split('/').slice(0,-1),...raw.split('/')]){if(p==='..'){if(!out.length)return null;out.pop();}else if(p&&p!=='.')out.push(p);}
 return out.length?out.join('/'):null;
}
const CSS_URL=/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]+))\s*\)/gi;
/** Rewrites url(...) references in CSS. `swap` returns a replacement URL or null to leave the reference unchanged. */
export function rewriteCssUrls(css:string,swap:(ref:string)=>string|null):string{
 return css.replace(CSS_URL,(whole,a,b,c)=>{const ref=(a??b??c??'').trim();const to=ref?swap(ref):null;return to==null?whole:`url("${to.replace(/["\\\n]/g,'')}")`;});
}
/** Rewrites a srcset value (comma separated candidates, each `url [descriptor]`). */
export function rewriteSrcset(value:string,swap:(ref:string)=>string|null):string{
 return value.split(',').map(part=>{const t=part.trim();if(!t)return t;const i=t.search(/\s/);const url=i<0?t:t.slice(0,i),rest=i<0?'':t.slice(i);const to=swap(url);return(to??url)+rest;}).filter(Boolean).join(', ');
}
export interface AssetPass{refs:Set<string>}
/** Replaces project-relative binary references in `doc` with the URLs in `assets` (resolved path to data:/blob: URL).
 * References not in `assets` stay untouched and are added to `refs` so the caller can load them and build again.
 * `skipStyles` holds style elements that were already handled (linked sheets are rewritten against their own folder). */
export function inlineBinaryAssets(doc:Document,active:string,assets:ReadonlyMap<string,string>,pass:AssetPass,skipStyles?:ReadonlySet<Element>):void{
 const swapFor=(base:string)=>(ref:string):string|null=>{
  const path=resolveProjectPath(base,ref);if(!path||!assetType(path))return null;
  const url=assets.get(path);if(url)return url;pass.refs.add(path);return null;
 };
 const swap=swapFor(active);
 for(const el of doc.querySelectorAll('img[src],video[src],audio[src],source[src],video[poster],input[type=image][src]')){
  for(const a of ['src','poster']){const v=el.getAttribute(a);if(v==null)continue;const to=swap(v);if(to)el.setAttribute(a,to);}
 }
 for(const el of doc.querySelectorAll('img[srcset],source[srcset]'))el.setAttribute('srcset',rewriteSrcset(el.getAttribute('srcset')||'',swap));
 for(const el of doc.querySelectorAll('[style]')){const v=el.getAttribute('style')||'';if(/url\(/i.test(v))el.setAttribute('style',rewriteCssUrls(v,swap));}
 for(const el of doc.querySelectorAll('style')){if(skipStyles?.has(el))continue;const v=el.textContent||'';if(/url\(/i.test(v))el.textContent=rewriteCssUrls(v,swap);}
}
/** Rewrites url() in a linked stylesheet against the stylesheet's own path. */
export function inlineCssAssets(css:string,cssPath:string,assets:ReadonlyMap<string,string>,pass:AssetPass):string{
 if(!/url\(/i.test(css))return css;
 return rewriteCssUrls(css,ref=>{const path=resolveProjectPath(cssPath,ref);if(!path||!assetType(path))return null;const url=assets.get(path);if(url)return url;pass.refs.add(path);return null;});
}
