import {buildPreview} from './livePreview';
import {describeSkipped,type PreviewAssetCache} from './previewAssetCache';
import type {PreviewAssetLoader} from './previewAssets';
/** Builds the preview with binary assets: build once to find references, load what the cache lacks, build again with the URLs.
 * Without a loader this is a plain build. Returns the notes for assets that could not be shown. */
export async function buildPreviewWithAssets(files:Readonly<Record<string,string>>,active:string,scripts:boolean,scrollY:number,cache:PreviewAssetCache,loader:PreviewAssetLoader|null,hash=''):Promise<{built:ReturnType<typeof buildPreview>;notes:string[]}>{
 let built=buildPreview(files,active,scripts,scrollY,cache.urls,hash);
 if(!loader)return {built,notes:[]};
 if(built.assetRefs.length&&await cache.ensure(built.assetRefs,loader))built=buildPreview(files,active,scripts,scrollY,cache.urls,hash);
 cache.prune(new Set(built.assetRefs.concat(referenced(built.html,cache))));
 const notes=cache.skippedAssets.filter(s=>built.assetRefs.includes(s.path)).map(describeSkipped);
 return {built,notes};
}
/** Paths still in use: every cached asset whose URL appears in the finished document. */
function referenced(html:string,cache:PreviewAssetCache):string[]{const out:string[]=[];for(const [path,url] of cache.urls)if(html.includes(url))out.push(path);return out;}
