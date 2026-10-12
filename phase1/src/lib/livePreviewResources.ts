import type {buildPreview} from './livePreview';
import {buildPreviewWithAssets} from './livePreviewAssets';
import {describeSkipped,type PreviewAssetCache} from './previewAssetCache';
import type {PreviewAssetLoader} from './previewAssets';
import {loadPreviewResources,mergeTextResources,type PreviewResources,type ProjectResourceReply} from './previewResources';
import type {PreviewResourceSource} from './previewResourceSource';
const NOTE:Record<PreviewResources['failed'][number]['reason'],string>={missing:'not found','too-large':'too large','outside-project':'outside the project folder',limit:'preview limit reached',error:'could not be read'};
export const describeFailed=(f:PreviewResources['failed'][number])=>`${f.path} (${NOTE[f.reason]})`;
export interface ResourceBuild{built:ReturnType<typeof buildPreview>;/** Text resources as loaded (raw, @imports not flattened), for dependency planning and hot CSS swaps. Empty without a project source. */text:Readonly<Record<string,string>>;/** External URLs the sandbox blocks (no network). */external:string[];/** Project files the preview could not load, each with its reason. */unloaded:string[]}
/** Builds the live preview with everything the document links on disk, also files that are not open in the editor.
 * Text (CSS, JS, module imports) comes from the resolver and the open editor text wins; binary assets (images, fonts, media) go through the data: URL cache once.
 * Without a project source (memory project) this is the plain asset build. */
export async function buildPreviewWithResources(o:{source:PreviewResourceSource|null;files:Readonly<Record<string,string>>;active:string;scripts:boolean;scrollY:number;hash?:string;cache:PreviewAssetCache;fallbackLoader:PreviewAssetLoader|null;signal?:AbortSignal}):Promise<ResourceBuild>{
 const {source,files,active,scripts,scrollY,cache,signal}=o;
 if(!source){const r=await buildPreviewWithAssets(files,active,scripts,scrollY,cache,o.fallbackLoader,o.hash);return{built:r.built,text:{},external:r.built.blocked,unloaded:r.notes};}
 const res=await loadPreviewResources({invoke:source.invoke,projectId:source.projectId,files,active,signal,skip:p=>cache.has(p)});
 const failed=new Set(res.failed.map(f=>f.path));
 // Binary files come from what the resolver already read; anything it did not reach (limits, CSS added by the merge) is read on demand.
 const loader:PreviewAssetLoader=async path=>{const a=res.assets[path];if(a)return{dataUrl:a.dataUrl};if(failed.has(path))return null;return source.invoke<ProjectResourceReply>('read_project_resource',{projectId:source.projectId,path}).then(r=>({dataUrl:`data:${r.mime};base64,${r.data}`}),()=>null);};
 const {built,notes:_notes}=await buildPreviewWithAssets(mergeTextResources(files,res),active,scripts,scrollY,cache,loader,o.hash);
 const unloaded=res.failed.map(describeFailed);
 for(const s of cache.skippedAssets)if(built.assetRefs.includes(s.path)&&!failed.has(s.path))unloaded.push(describeSkipped(s));
 return{built,text:res.text,external:built.blocked,unloaded};
}
/** Binary loader over `read_project_resource`, for the on-disk change watch. Null when the file is missing or unreadable. */
export const resourceAssetLoader=(source:PreviewResourceSource):PreviewAssetLoader=>path=>source.invoke<ProjectResourceReply>('read_project_resource',{projectId:source.projectId,path}).then(r=>({dataUrl:`data:${r.mime};base64,${r.data}`}),()=>null);
